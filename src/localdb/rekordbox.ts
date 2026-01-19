import {KaitaiStream} from 'kaitai-struct';

import {
  Album,
  Artist,
  Artwork,
  Color,
  EntityFK,
  Genre,
  Key,
  Label,
  Playlist,
  PlaylistEntry,
  Track,
} from 'src/entities';
import RekordboxAnlz from 'src/localdb/kaitai/rekordbox_anlz.ksy';
import RekordboxPdb from 'src/localdb/kaitai/rekordbox_pdb.ksy';
import {MetadataORM, Table} from 'src/localdb/orm';
import {makeCueLoopEntry} from 'src/localdb/utils';
import {
  BeatGrid,
  CueAndLoop,
  ExtendedCue,
  HotcueButton,
  Phrase,
  SongStructure,
  WaveformHD,
  WaveformPreviewData,
} from 'src/types';
import {convertWaveformHDData} from 'src/utils/converters';
import {TelemetrySpan as Span} from 'src/utils/telemetry';
import * as Telemetry from 'src/utils/telemetry';

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
 * Data returned from loading DAT anlz files
 */
interface AnlzResponseDAT {
  /**
   * Embedded beat grid information
   */
  beatGrid: BeatGrid | null;
  /**
   * Embedded cue and loop information
   */
  cueAndLoops: CueAndLoop[] | null;
  /**
   * Standard waveform preview (400 bytes, PWAV tag)
   */
  waveformPreview: WaveformPreviewData | null;
  /**
   * Tiny waveform preview (100 bytes, PWV2 tag)
   */
  waveformTiny: WaveformPreviewData | null;
}

/**
 * Data returned from loading EXT anlz files
 */
interface AnlzResponseEXT {
  /**
   * HD Waveform information (PWV5 tag)
   */
  waveformHd: WaveformHD | null;
  /**
   * Extended cues with colors and comments (PCO2 tag)
   */
  extendedCues: ExtendedCue[] | null;
  /**
   * Song structure / phrase analysis (PSSI tag)
   */
  songStructure: SongStructure | null;
  /**
   * Monochrome detailed waveform (PWV3 tag)
   */
  waveformDetail: Uint8Array | null;
  /**
   * Color waveform preview (PWV4 tag, 7200 bytes = 1200 columns × 6 bytes)
   */
  waveformColorPreview: Uint8Array | null;
}

interface AnlzResponse {
  DAT: AnlzResponseDAT;
  EXT: AnlzResponseEXT;
}

/**
 * Details about the current state of the hydtration task
 */
export interface HydrationProgress {
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
}

/**
 * Options to hydrate the database
 */
interface Options {
  /**
   * The metadata ORM of which the tables will be hydrated
   */
  orm: MetadataORM;
  /**
   * This buffer should contain the Rekordbox pdb file contents. It will be
   * used to do the hydration
   */
  pdbData: Buffer;
  /**
   * Sentry tracing span for the parent transaction
   */
  span?: Span;
  /**
   * For larger music collections, it may take some time to load everything,
   * especially when limited by IO. When hydration progresses this function
   * will be called.
   */
  onProgress?: (progress: HydrationProgress) => void;
}

/**
 * Given a rekordbox pdb file contents. This function will hydrate the provided
 * database with all entities from the Rekordbox database. This includes all
 * track metadata, including analyzed metadata (such as beatgrids and waveforms).
 */
export async function hydrateDatabase({pdbData, span, ...options}: Options) {
  const hydrator = new RekordboxHydrator(options);
  await hydrator.hydrateFromPdb(pdbData, span);
}

/**
 * Loads the ANLZ data of a Track entity from the analyzePath.
 */
export async function loadAnlz<T extends keyof AnlzResponse>(
  track: Track,
  type: T,
  anlzResolver: AnlzResolver
): Promise<AnlzResponse[T]> {
  const path = `${track.analyzePath}.${type}`;
  const anlzData = await anlzResolver(path);

  const stream = new KaitaiStream(anlzData);
  const anlz = new RekordboxAnlz(stream);

  const result = {} as AnlzResponse[T];
  const resultDat = result as AnlzResponseDAT;
  const resultExt = result as AnlzResponseEXT;

  for (const section of anlz.sections) {
    switch (section.fourcc) {
      case SectionTags.BEAT_GRID:
        resultDat.beatGrid = makeBeatGrid(section);
        break;

      case SectionTags.CUES:
        resultDat.cueAndLoops = makeCueAndLoop(section);
        break;

      case SectionTags.CUES_2:
        resultExt.extendedCues = makeExtendedCues(section);
        break;

      case SectionTags.WAVE_PREVIEW:
        resultDat.waveformPreview = makeWaveformPreview(section);
        break;

      case SectionTags.WAVE_TINY:
        resultDat.waveformTiny = makeWaveformPreview(section);
        break;

      case SectionTags.WAVE_SCROLL:
        resultExt.waveformDetail = Buffer.from(section.body.entries);
        break;

      case SectionTags.WAVE_COLOR_PREVIEW:
        resultExt.waveformColorPreview = Buffer.from(section.body.entries);
        break;

      case SectionTags.WAVE_COLOR_SCROLL:
        resultExt.waveformHd = makeWaveformHd(section);
        break;

      case SectionTags.SONG_STRUCTURE:
        resultExt.songStructure = makeSongStructure(section);
        break;

      // VBR and PATH tags are defined but not currently extracted
      // as they're not commonly needed in the application
      case SectionTags.VBR:
      case SectionTags.PATH:
        break;
    }
  }

  return result;
}

/**
 * This service provides utilities for translating rekordbox database (pdb_ and
 * analysis (ANLZ) files into the common entity types used in this library.
 */
class RekordboxHydrator {
  #orm: MetadataORM;
  #onProgress: (progress: HydrationProgress) => void;

  constructor({orm, onProgress}: Omit<Options, 'pdbData'>) {
    this.#orm = orm;
    this.#onProgress = onProgress ?? (() => null);
  }

  /**
   * Extract entries from a rekordbox pdb file and hydrate the passed database
   * connection with entities derived from the rekordbox entries.
   */
  async hydrateFromPdb(pdbData: Buffer, span?: Span) {
    const PROFILE = process.env.NP_PROFILE_HYDRATION === '1';

    const tx = span
      ? span.startChild({op: 'hydrateFromPdb'})
      : Telemetry.startTransaction({name: 'hydrateFromPdb'});

    const parseTx = tx.startChild({op: 'parsePdbData', data: {size: pdbData.length}});
    const parseStart = PROFILE ? performance.now() : 0;
    const stream = new KaitaiStream(pdbData);
    const db = new RekordboxPdb(stream);
    if (PROFILE) {
      console.log(
        `[HYDRATION PROFILE] PDB parsing: ${(performance.now() - parseStart).toFixed(1)}ms (${(pdbData.length / 1024 / 1024).toFixed(2)} MB)`
      );
    }
    parseTx.finish();

    const hydrateTx = tx.startChild({op: 'hydration'});
    const hydrateStart = PROFILE ? performance.now() : 0;
    await Promise.all(
      db.tables.map((table: any) => this.hydrateFromTable(table, hydrateTx))
    );
    if (PROFILE) {
      console.log(
        `[HYDRATION PROFILE] Total hydration: ${(performance.now() - hydrateStart).toFixed(1)}ms`
      );
    }
    hydrateTx.finish();

    tx.finish();
  }

  /**
   * Hydrate the database with entities from the provided RekordboxPdb table.
   * See pdbEntityCreators for how tables are mapped into database entities.
   */
  async hydrateFromTable(table: any, span: Span) {
    const tableName = pdbTables[table.type];
    const createObject = pdbEntityCreators[table.type];

    const tx = span.startChild({op: 'hydrateFromTable', description: tableName});

    if (createObject === undefined) {
      return;
    }

    // Profiling: track time spent in each phase
    const PROFILE = process.env.NP_PROFILE_HYDRATION === '1';
    const profile = {
      countLoop: 0,
      entityCreation: 0,
      sqliteInsert: 0,
      yieldTime: 0,
      total: 0,
    };
    const profileStart = PROFILE ? performance.now() : 0;

    let totalSaved = 0;
    let totalItems = 0;

    const countStart = PROFILE ? performance.now() : 0;
    for (const _row of tableRows(table)) {
      void _row; // Intentionally unused - just counting
      totalItems++;
    }
    if (PROFILE) {
      profile.countLoop = performance.now() - countStart;
    }

    tx.setData('items', totalItems);

    // Use transaction for bulk inserts (10-100x faster)
    this.#orm.beginTransaction();

    try {
      for (const row of tableRows(table)) {
        const createStart = PROFILE ? performance.now() : 0;
        const entity = createObject(row);
        if (PROFILE) {
          profile.entityCreation += performance.now() - createStart;
        }

        const insertStart = PROFILE ? performance.now() : 0;
        this.#orm.insertEntity(tableName, entity);
        if (PROFILE) {
          profile.sqliteInsert += performance.now() - insertStart;
        }

        totalSaved++;

        // Report progress and yield every 100 rows (instead of every row)
        if (totalSaved % 100 === 0 || totalSaved === totalItems) {
          this.#onProgress({complete: totalSaved, table: tableName, total: totalItems});
          // Yield to event loop periodically to keep UI responsive
          const yieldStart = PROFILE ? performance.now() : 0;
          await new Promise(r => setTimeout(r, 0));
          if (PROFILE) {
            profile.yieldTime += performance.now() - yieldStart;
          }
        }
      }
    } finally {
      this.#orm.commit();
    }

    if (PROFILE) {
      profile.total = performance.now() - profileStart;
      console.log(`[HYDRATION PROFILE] ${tableName} (${totalItems} rows):`);
      console.log(`  Count loop:      ${profile.countLoop.toFixed(1)}ms`);
      console.log(`  Entity creation: ${profile.entityCreation.toFixed(1)}ms`);
      console.log(`  SQLite insert:   ${profile.sqliteInsert.toFixed(1)}ms`);
      console.log(`  Yield time:      ${profile.yieldTime.toFixed(1)}ms`);
      console.log(`  Total:           ${profile.total.toFixed(1)}ms`);
      console.log(
        `  Unaccounted:     ${(profile.total - profile.countLoop - profile.entityCreation - profile.sqliteInsert - profile.yieldTime).toFixed(1)}ms`
      );
    }

    tx.finish();
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

interface IdAndNameEntity {
  id: number;
  name: string;
}

const ensureDate = (date: Date) =>
  date instanceof Date && !isNaN(date.valueOf()) ? date : undefined;

/**
 * Utility to create a hydrator that hydrates the provided entity with the id
 * and name properties from the row.
 */
const makeIdNameHydrator =
  <T extends IdAndNameEntity>() =>
  (row: any) =>
    ({
      id: row.id,
      name: row.name.body.text ?? '',
    }) as T;

/**
 * Translates a pdb track row entry to a {@link Track} entity.
 */
function createTrack(trackRow: any) {
  const analyzePath: string | undefined = trackRow.analyzePath.body.text;

  const track: Track<EntityFK.WithFKs> = {
    id: trackRow.id,
    title: trackRow.title.body.text,
    trackNumber: trackRow.trackNumber,
    discNumber: trackRow.discNumber,
    duration: trackRow.duration,
    sampleRate: trackRow.sampleRate,
    sampleDepth: trackRow.sampleDepth,
    bitrate: trackRow.bitrate,
    tempo: trackRow.tempo / 100,
    playCount: trackRow.playCount,
    year: trackRow.year,
    rating: trackRow.rating,
    mixName: trackRow.mixName.body.text,
    comment: trackRow.comment.body.text,
    autoloadHotcues: trackRow.autoloadHotcues.body.text === 'ON',
    kuvoPublic: trackRow.kuvoPublic.body.text === 'ON',
    filePath: trackRow.filePath.body.text,
    fileName: trackRow.filename.body.text,
    fileSize: trackRow.fileSize,
    releaseDate: trackRow.releaseDate.body.text,
    analyzeDate: ensureDate(new Date(trackRow.analyzeDate.body.text)),
    dateAdded: ensureDate(new Date(trackRow.dateAdded.body.text)),

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
    analyzePath: analyzePath?.substring(0, analyzePath.length - 4),

    artworkId: trackRow.artworkId || null,
    artistId: trackRow.artistId || null,
    originalArtistId: trackRow.originalArtistId || null,
    remixerId: trackRow.remixerId || null,
    composerId: trackRow.composerId || null,
    albumId: trackRow.albumId || null,
    labelId: trackRow.labelId || null,
    genreId: trackRow.genreId || null,
    colorId: trackRow.colorId || null,
    keyId: trackRow.keyId || null,

    // NOTE: There are a few additional columns that will be hydrated through
    // the analyze files (given the analyzePath) which we do not assign here.
    beatGrid: null,
    cueAndLoops: null,
    waveformHd: null,
  };

  return track;
}

/**
 * Translates a pdb playlist row entry into a {@link Playlist} entity.
 */
function createPlaylist(playlistRow: any) {
  const playlist: Playlist = {
    id: playlistRow.id,
    name: playlistRow.name.body.text,
    isFolder: playlistRow.rawIsFolder !== 0,
    parentId: playlistRow.parentId || null,
  };

  return playlist;
}

/**
 * Translates a pdb playlist track entry into a {@link PlaylistTrack} entity.
 */
function createPlaylistEntry(playlistTrackRow: any) {
  const entry: PlaylistEntry<EntityFK.WithFKs> = {
    id: playlistTrackRow.id,
    sortIndex: playlistTrackRow.entryIndex,
    playlistId: playlistTrackRow.playlistId,
    trackId: playlistTrackRow.trackId,
  };

  return entry;
}

/**
 * Translates a pdb artwork entry into a {@link Artwork} entity.
 */
function createArtworkEntry(artworkRow: any) {
  const art: Artwork = {
    id: artworkRow.id,
    path: artworkRow.path.body.text,
  };

  return art;
}

/**
 * Fill beatgrid data from the ANLZ section
 */
function makeBeatGrid(data: any) {
  return data.body.beats.map((beat: any) => ({
    offset: beat.time,
    bpm: beat.tempo / 100,
    count: beat.beatNumber,
  }));
}

/**
 * Fill cue and loop data from the ANLZ section
 */
function makeCueAndLoop(data: any) {
  return data.body.cues.map((entry: any) => {
    // Cues with the status 0 are likely leftovers that were removed

    const button = entry.hotCue === 0 ? false : (entry.type as HotcueButton);
    const isCue = entry.type === 0x01;
    const isLoop = entry.type === 0x02;

    // NOTE: Unlike the remotedb, these entries are already in milliseconds.
    const offset = entry.time;
    const length = entry.loopTime - offset;

    return makeCueLoopEntry(isCue, isLoop, offset, length, button);
  });
}

/**
 * Fill waveform HD data from the ANLZ section
 */
function makeWaveformHd(data: any) {
  return convertWaveformHDData(Buffer.from(data.body.entries));
}

/**
 * Parse extended cues (PCO2) with colors and comments
 */
function makeExtendedCues(data: any): ExtendedCue[] {
  return data.body.cues.map((entry: any) => {
    const cue: ExtendedCue = {
      hotCue: entry.hotCue,
      type: entry.type,
      time: entry.time,
    };

    // Add loop end time if this is a loop
    if (entry.type === 2 && entry.loopTime !== undefined) {
      cue.loopTime = entry.loopTime;
    }

    // Add color ID for memory points/loops
    if (entry.colorId !== undefined && entry.colorId > 0) {
      cue.colorId = entry.colorId;
    }

    // Add hot cue color information
    if (entry.colorCode !== undefined && entry.colorCode > 0) {
      cue.colorCode = entry.colorCode;
      cue.colorRgb = {
        r: entry.colorRed ?? 0,
        g: entry.colorGreen ?? 0,
        b: entry.colorBlue ?? 0,
      };
    }

    // Add comment if present
    if (entry.lenComment > 0 && entry.comment) {
      cue.comment = entry.comment;
    }

    // Add quantized loop information if present
    if (entry.loopNumerator !== undefined && entry.loopNumerator > 0) {
      cue.loopNumerator = entry.loopNumerator;
      cue.loopDenominator = entry.loopDenominator ?? 1;
    }

    return cue;
  });
}

/**
 * Parse song structure (PSSI) with phrase analysis
 */
function makeSongStructure(data: any): SongStructure {
  const moodMap: Record<number, 'high' | 'mid' | 'low'> = {
    1: 'high',
    2: 'mid',
    3: 'low',
  };

  const bankMap: Record<number, SongStructure['bank']> = {
    0: 'default',
    1: 'cool',
    2: 'natural',
    3: 'hot',
    4: 'subtle',
    5: 'warm',
    6: 'vivid',
    7: 'club_1',
    8: 'club_2',
  };

  // Phrase type mappings based on mood
  const phraseTypeMap: Record<'high' | 'mid' | 'low', Record<number, string>> = {
    high: {
      1: 'Intro',
      2: 'Up',
      3: 'Down',
      5: 'Chorus',
      6: 'Outro',
    },
    mid: {
      1: 'Intro',
      2: 'Verse 1',
      3: 'Verse 2',
      4: 'Verse 3',
      5: 'Verse 4',
      6: 'Verse 5',
      7: 'Verse 6',
      8: 'Bridge',
      9: 'Chorus',
      10: 'Outro',
    },
    low: {
      1: 'Intro',
      2: 'Verse 1',
      3: 'Verse 1',
      4: 'Verse 1',
      5: 'Verse 2',
      6: 'Verse 2',
      7: 'Verse 2',
      8: 'Bridge',
      9: 'Chorus',
      10: 'Outro',
    },
  };

  const mood = moodMap[data.body.mood] ?? 'high';
  const bank = bankMap[data.body.rawBank] ?? 'default';

  const phrases: Phrase[] = data.body.entries.map((entry: any) => {
    const phrase: Phrase = {
      index: entry.index,
      beat: entry.beat,
      kind: entry.kind,
      phraseType: phraseTypeMap[mood][entry.kind] ?? 'Unknown',
    };

    // Add fill-in information if present
    if (entry.fill > 0) {
      phrase.fill = entry.fill;
      phrase.fillBeat = entry.beatFill;
    }

    return phrase;
  });

  return {
    mood,
    bank,
    endBeat: data.body.endBeat,
    phrases,
  };
}

/**
 * Parse waveform preview data (PWAV/PWV2)
 */
function makeWaveformPreview(data: any): WaveformPreviewData {
  return {
    data: Buffer.from(data.body.data),
  };
}

const {PageType} = RekordboxPdb;
const {SectionTags} = RekordboxAnlz;

/**
 * Maps rekordbox pdb table types to orm table names.
 */
const pdbTables = {
  [PageType.TRACKS]: Table.Track,
  [PageType.ARTISTS]: Table.Artist,
  [PageType.GENRES]: Table.Genre,
  [PageType.ALBUMS]: Table.Album,
  [PageType.LABELS]: Table.Label,
  [PageType.COLORS]: Table.Color,
  [PageType.KEYS]: Table.Key,
  [PageType.ARTWORK]: Table.Artwork,
  [PageType.PLAYLIST_TREE]: Table.Playlist,
  [PageType.PLAYLIST_ENTRIES]: Table.PlaylistEntry,
};

/**
 * Maps rekordbox pdb table types to functions that create entity objects for
 * the passed pdb row.
 */
const pdbEntityCreators = {
  [PageType.TRACKS]: createTrack,
  [PageType.ARTISTS]: makeIdNameHydrator<Artist>(),
  [PageType.GENRES]: makeIdNameHydrator<Genre>(),
  [PageType.ALBUMS]: makeIdNameHydrator<Album>(),
  [PageType.LABELS]: makeIdNameHydrator<Label>(),
  [PageType.COLORS]: makeIdNameHydrator<Color>(),
  [PageType.KEYS]: makeIdNameHydrator<Key>(),
  [PageType.ARTWORK]: createArtworkEntry,
  [PageType.PLAYLIST_TREE]: createPlaylist,
  [PageType.PLAYLIST_ENTRIES]: createPlaylistEntry,

  // TODO: Register PageType.HISTORY
};
