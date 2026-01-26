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
export const makeIdNameHydrator =
  <T extends IdAndNameEntity>() =>
  (row: any) =>
    ({
      id: row.id,
      name: row.name.body.text ?? '',
    }) as T;

/**
 * Translates a pdb track row entry to a {@link Track} entity.
 */
export function createTrack(trackRow: any) {
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
export function createPlaylist(playlistRow: any) {
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
export function createPlaylistEntry(playlistTrackRow: any) {
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
export function createArtworkEntry(artworkRow: any) {
  const art: Artwork = {
    id: artworkRow.id,
    path: artworkRow.path.body.text,
  };

  return art;
}

// Re-export types for table mappings
export type {Album, Artist, Color, Genre, Key, Label};
