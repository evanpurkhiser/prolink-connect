import {KaitaiStream} from 'kaitai-struct';
import {MikroORM, EntityManager} from 'mikro-orm';

import RekordboxPdb from 'src/localdb/kaitai/rekordbox_pdb.ksy';
import RekordboxAnlz from 'src/localdb/kaitai/rekordbox_anlz.ksy';
import {makeCueLoopEntry} from 'src/localdb/utils';
import {HotcueButton} from 'src/types';
import {
  Track,
  Artist,
  Album,
  Key,
  Color,
  Genre,
  Label,
  Playlist,
  PlaylistEntry,
  Artwork,
} from 'src/entities';

// NOTE: Kaitai doesn't currently have a good typescript exporter, so we will
//       be making liberal usage of any in these utilities. We still guarantee
//       a fully typed public interface of this module.

/**
 * The provided function should resolve ANLZ files into buffers. Typically
 * you would just read the file, but in the case of the prolink network, this
 * would handle loading the file over NFS.
 */
type AnlzResolver = (path: string) => Promise<Buffer>;

/**
 * Details about the current state of the hydtration task
 */
export type HydrationProgress = {
  /**
   * The specific table that progress is being reported for
   */
  table: string;
  /**
   * The total progress steps for this table
   */
  total: number;
  /**
   * The completed number of progress steps
   */
  complete: number;
};

/**
 * Options to hydrate the database
 */
type Options = {
  /**
   * The database connection of which the tables will be hydrated
   */
  orm: MikroORM;
  /**
   * This buffer should contain the Rekordbox pdb file contents. It will be
   * used to do the hydration
   */
  pdbData: Buffer;
  /**
   * For larger music collections, it may take some time to load everything,
   * especially when limited by IO. When hydration progresses this function
   * will be called.
   */
  onProgress?: (progress: HydrationProgress) => void;
};

/**
 * Given a rekordbox pdb file contents. This function will hydrate the provided
 * database with all entities from the Rekordbox database. This includes all
 * track metadata, including analyzed metadata (such as beatgrids and waveforms).
 */
export async function hydrateDatabase({pdbData, ...options}: Options) {
  const hydrator = new RekordboxHydrator(options);
  await hydrator.hydrateFromPdb(pdbData);
}

/**
 * Hydrate the ANLZ sections of a Track entity from the analyzePath. This
 * method will mutate the passed Track entity.
 */
export async function hydrateAnlz(
  track: Track,
  type: 'DAT' | 'EXT',
  anlzResolver: AnlzResolver
) {
  const path = `${track.analyzePath}.${type}`;
  const anlzData = await anlzResolver(path);

  const stream = new KaitaiStream(anlzData);
  const anlz = new RekordboxAnlz(stream);

  for (const section of anlz.sections) {
    trackAnlzHydrators[section.fourcc]?.(track, section);
  }
}

/**
 * This service provides utilities for translating rekordbox database (pdb_ and
 * analysis (ANLZ) files into the common entity types used in this library.
 */
class RekordboxHydrator {
  #orm: MikroORM;
  #onProgress: (progress: HydrationProgress) => void;

  constructor({orm, onProgress}: Omit<Options, 'pdbData'>) {
    this.#orm = orm;
    this.#onProgress = onProgress ?? (_ => null);
  }

  /**
   * Extract entries from a rekordbox pdb file and hydrate the passed database
   * connection with entities derived from the rekordbox entries.
   */
  async hydrateFromPdb(pdbData: Buffer) {
    const stream = new KaitaiStream(pdbData);
    const db = new RekordboxPdb(stream);

    // TODO: Not sure why the transaction doesn't handle differing foreign key
    //       constraints, without this we will get FK constraint errors
    //       (despite the comment above the transaction call below).
    const driver = await this.#orm.connect();
    const conn = await driver.connect();
    await conn.execute('PRAGMA foreign_keys = OFF;');

    const doHydration = async (em: EntityManager) => {
      await Promise.all(db.tables.map((table: any) => this.hydrateFromTable(table, em)));
      await em.flush();
    };

    // Execute within a transaction to allow for deferred foreign key constraints.
    await this.#orm.em.transactional(doHydration);
  }

  /**
   * Hydrate the database with entities from the provided RekordboxPdb table.
   * See pdbEntityCreators for how tables are mapped into database entities.
   */
  async hydrateFromTable(table: any, em: EntityManager) {
    const tableName: string = RekordboxPdb.PageType[table.type].toLowerCase();
    const createEntity = pdbEntityCreators[table.type];

    if (createEntity === undefined) {
      return;
    }

    let totalSaved = 0;
    let totalItems = 0;
    for await (const _ of tableRows(table)) {
      totalItems++;
    }

    const saveEntity = (entity: ReturnType<typeof createEntity>) =>
      new Promise<never>(async finished => {
        if (entity) {
          await em.persist(entity);
        }

        finished();
        this.#onProgress({complete: ++totalSaved, table: tableName, total: totalItems});
      });

    const savingEntities: Promise<never>[] = [];

    for await (const row of tableRows(table)) {
      const entity = createEntity(row);
      const savePromise = saveEntity(entity);

      savingEntities.push(savePromise);

      // Allow additional tasks to occur during hydration
      await new Promise(r => setTimeout(r, 0));
    }

    await Promise.all(savingEntities);
  }
}

/**
 * Utility generator that pages through a table and yields every present row.
 * This flattens the concept of rowGroups and refs.
 */
function* tableRows(table: any) {
  const {firstPage, lastPage} = table;

  let pageRef = firstPage;
  do {
    const page = pageRef.body;

    // Adjust our page ref for the next iteration. We do this early in our loop
    // so we can break without having to remember to update for the next iter.
    pageRef = page.nextPage;

    // Ignore non-data pages. Not sure what these are for?
    if (!page.isDataPage) {
      continue;
    }

    const rows = page.rowGroups
      .map((group: any) => group.rows)
      .flat()
      .filter((row: any) => row.present);

    for (const row of rows) {
      yield row.body;
    }
  } while (pageRef.index <= lastPage.index);
}

type IdAndNameEntity = new () => {id: number; name: string};

/**
 * Utility to create a hydrator that hydrates the provided entity with the id
 * and name properties from the row.
 */
const makeIdNameHydrator = <T extends IdAndNameEntity>(Entity: T) => (row: any) => {
  const item = new Entity();

  item.id = row.id;
  item.name = row.name.body.text;

  return item;
};

/**
 * Translates a pdb track row entry to a {@link Track} entity.
 */
function createTrack(trackRow: any) {
  const track = new Track();
  track.id = trackRow.id;
  track.title = trackRow.title.body.text;
  track.trackNumber = trackRow.trackNumber;
  track.discNumber = trackRow.discNumber;
  track.duration = trackRow.duration;
  track.sampleRate = trackRow.sampleRate;
  track.sampleDepth = trackRow.sampleDepth;
  track.bitrate = trackRow.bitrate;
  track.tempo = trackRow.tempo / 100;
  track.playCount = trackRow.playCount;
  track.year = trackRow.year;
  track.rating = trackRow.rating;
  track.mixName = trackRow.mixName.body.text;
  track.comment = trackRow.comment.body.text;
  track.autoloadHotcues = trackRow.autoloadHotcues.body.text === 'ON';
  track.kuvoPublic = trackRow.kuvoPublic.body.text === 'ON';
  track.filePath = trackRow.filePath.body.text;
  track.fileName = trackRow.filename.body.text;
  track.fileSize = trackRow.fileSize;
  track.analyzePath = trackRow.analyzePath.body.text;
  track.releaseDate = trackRow.releaseDate.body.text;
  track.analyzeDate = new Date(trackRow.analyzeDate.body.text);
  track.dateAdded = new Date(trackRow.dateAdded.body.text);

  // The analyze file comes in 3 forms
  //
  //  1. A `DAT` file, which is missing some extended information, for the older
  //     Pioneer equipment (likely due to memory constraints).
  //
  //  2. A `EXT` file which includes colored waveforms and other extended data.
  //
  //  3. A `EX2` file -- currently unknown
  //
  // We noramlize this path by trimming the DAT extension off. Later we will
  // try and read whatever is available.
  track.analyzePath = track.analyzePath?.substring(0, track.analyzePath.length - 4);

  // This implicitly bypasses typescripts checks since these would expect to be
  // assigned to objects. In this case we are _okay_ with this as the entity
  // manager will translates these ids into the database fields.
  track.artist = trackRow.artistId || null;
  track.artwork = trackRow.artworkId || null;
  track.originalArtist = trackRow.originalArtistId || null;
  track.remixer = trackRow.remixerId || null;
  track.composer = trackRow.composerId || null;
  track.album = trackRow.albumId || null;
  track.label = trackRow.labelId || null;
  track.genre = trackRow.genreId || null;
  track.color = trackRow.colorId || null;
  track.key = trackRow.keyId || null;

  // NOTE: There are a few additional columns that will be hydrated through the
  // analyze files (given the analyzePath) which we do not assign here.

  return track;
}

/**
 * Translates a pdb playlist row entry into a {@link Playlist} entity.
 */
function createPlaylist(playlistRow: any) {
  const playlist = new Playlist();
  playlist.id = playlistRow.id;
  playlist.name = playlistRow.name.body.text;
  playlist.parent = playlistRow.parentId || null;
  playlist.isFolder = playlistRow.rawIsFolder !== 0;

  return playlist;
}

/**
 * Translates a pdb playlist track entry into a {@link PlaylistTrack} entity.
 */
function createPlaylistEntry(playlistTrackRow: any) {
  const entry = new PlaylistEntry();
  entry.sortIndex = playlistTrackRow.entryIndex;
  entry.playlist = playlistTrackRow.playlistId;
  entry.track = playlistTrackRow.trackId;

  return entry;
}

/**
 * Translates a pdb artwork entry into a {@link Artwork} entity.
 */
function createArtworkEntry(artworkRow: any) {
  const art = new Artwork();
  art.id = artworkRow.id;
  art.path = artworkRow.path.body.text;

  return art;
}

function createHistoryEntry(historyRow: any) {
  // TODO
  return null;
}

/**
 * Fill beatgrid data from the ANLZ section
 */
function hydrateBeatgrid(track: Track, data: any) {
  const beatgrid = data.body.beats.map((beat: any) => ({
    offset: beat.time,
    bpm: beat.tempo / 100,
    count: beat.beatNumber,
  }));

  track.beatGrid = beatgrid;
}

/**
 * Fill cue and loop data from the ANLZ section
 */
function hydrateCueAndLoop(track: Track, data: any) {
  const cueAndLoops = data.body.cues.map((entry: any) => {
    // Cues with the status 0 are likely leftovers that were removed

    const button = entry.hotCue === 0 ? false : (entry.type as HotcueButton);
    const isCue = entry.type === 0x01;
    const isLoop = entry.type === 0x02;

    // NOTE: Unlike the remotedb, these entries are already in milliseconds.
    const offset = entry.time;
    const length = entry.loopTime - offset;

    return makeCueLoopEntry(isCue, isLoop, offset, length, button);
  });

  track.cueAndLoops = cueAndLoops;
}

const {PageType} = RekordboxPdb;
const {SectionTags} = RekordboxAnlz;

/**
 * Maps rekordbox table names to funcitons that create entity objects for the
 * passed row.
 */
const pdbEntityCreators = {
  [PageType.TRACKS]: createTrack,
  [PageType.ARTISTS]: makeIdNameHydrator(Artist),
  [PageType.GENRES]: makeIdNameHydrator(Genre),
  [PageType.ALBUMS]: makeIdNameHydrator(Album),
  [PageType.LABELS]: makeIdNameHydrator(Label),
  [PageType.COLORS]: makeIdNameHydrator(Color),
  [PageType.KEYS]: makeIdNameHydrator(Key),
  [PageType.ARTWORK]: createArtworkEntry,
  [PageType.PLAYLIST_TREE]: createPlaylist,
  [PageType.PLAYLIST_ENTRIES]: createPlaylistEntry,
  [PageType.HISTORY]: createHistoryEntry,
};

/**
 * Hydrate provided Track entities with data from named ANLZ sections.
 */
const trackAnlzHydrators = {
  [SectionTags.BEAT_GRID]: hydrateBeatgrid,
  [SectionTags.CUES]: hydrateCueAndLoop,

  // TODO: The following sections haven't yet been extracted into the local
  //       database.
  //
  // [SectionTags.CUES_2]: null,             <- In the EXT file
  // [SectionTags.SONG_STRUCTURE]: null,     <- In the EXT file
  // [SectionTags.WAVE_PREVIEW]: null,
  // [SectionTags.WAVE_SCROLL]: null,
  // [SectionTags.WAVE_COLOR_PREVIEW]: null, <- In the EXT file
  // [SectionTags.WAVE_COLOR_SCROLL]: null,  <- In the EXT file
};

export const expectedTables = Object.keys(pdbEntityCreators).map(pageId =>
  RekordboxPdb.PageType[pageId].toLowerCase()
);
