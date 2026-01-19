/**
 * TypeScript interfaces for the OneLibrary (exportLibrary.db) SQLite schema.
 *
 * These match the actual column names in the SQLite database,
 * which differ from the legacy PDB format.
 *
 * Note: Column names use camelCase in the database (e.g., bpmx100, titleForSearch)
 */

// ============================================================================
// Content (Track) Table
// ============================================================================

export interface ContentRow {
  content_id: number;
  title: string | null;
  titleForSearch: string | null;
  subtitle: string | null;
  bpmx100: number | null; // BPM * 100 (e.g., 12800 = 128.00 BPM)
  length: number | null; // Duration in milliseconds
  trackNo: number | null;
  discNo: number | null;

  // Artist foreign keys (multiple artist types)
  artist_id_artist: number | null;
  artist_id_remixer: number | null;
  artist_id_originalArtist: number | null;
  artist_id_composer: number | null;
  artist_id_lyricist: number | null;

  // Other foreign keys
  album_id: number | null;
  genre_id: number | null;
  label_id: number | null;
  key_id: number | null;
  color_id: number | null;
  image_id: number | null;

  djComment: string | null;
  rating: number | null; // 0-5
  releaseYear: number | null;
  releaseDate: string | null;
  dateCreated: string | null;
  dateAdded: string | null;

  // File info
  path: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: number | null;
  bitrate: number | null;
  bitDepth: number | null;
  samplingRate: number | null;
  isrc: string | null;

  // Playback
  djPlayCount: number | null;
  isHotCueAutoLoadOn: number | null; // boolean as 0/1
  isKuvoDeliverStatusOn: number | null; // boolean as 0/1
  kuvoDeliveryComment: string | null;

  // rekordbox sync
  masterDbId: number | null;
  masterContentId: number | null;
  analysisDataFilePath: string | null;
  analysedBits: number | null;
  contentLink: number | null;

  // Update tracking
  hasModified: number | null;
  cueUpdateCount: number | null;
  analysisDataUpdateCount: number | null;
  informationUpdateCount: number | null;
}

// ============================================================================
// Reference Tables
// ============================================================================

export interface ArtistRow {
  artist_id: number;
  name: string | null;
  nameForSearch: string | null;
}

export interface AlbumRow {
  album_id: number;
  name: string | null;
  artist_id: number | null;
  image_id: number | null;
  isComplation: number | null; // boolean as 0/1 (typo in db: "complation")
  nameForSearch: string | null;
}

export interface GenreRow {
  genre_id: number;
  name: string | null;
}

export interface KeyRow {
  key_id: number;
  name: string | null;
}

export interface ColorRow {
  color_id: number;
  name: string | null;
}

export interface LabelRow {
  label_id: number;
  name: string | null;
}

export interface ImageRow {
  image_id: number;
  path: string | null;
}

// ============================================================================
// Cue Points
// ============================================================================

export interface CueRow {
  cue_id: number;
  content_id: number | null;
  kind: number | null; // 0 = memory cue, 1 = hot cue, etc.
  colorTableIndex: number | null;
  cueComment: string | null;
  isActiveLoop: number | null; // boolean as 0/1
  beatLoopNumerator: number | null;
  beatLoopDenominator: number | null;
  inUsec: number | null; // Start position in microseconds
  outUsec: number | null; // End position in microseconds (for loops)
  in150FramePerSec: number | null;
  out150FramePerSec: number | null;
  inMpegFrameNumber: number | null;
  outMpegFrameNumber: number | null;
  inMpegAbs: number | null;
  outMpegAbs: number | null;
  inDecodingStartFramePosition: number | null;
  outDecodingStartFramePosition: number | null;
  inFileOffsetInBlock: number | null;
  OutFileOffsetInBlock: number | null;
  inNumberOfSampleInBlock: number | null;
  outNumberOfSampleInBlock: number | null;
}

// ============================================================================
// Playlists
// ============================================================================

export interface PlaylistRow {
  playlist_id: number;
  sequenceNo: number | null;
  name: string | null;
  image_id: number | null;
  attribute: number | null; // 0 = playlist, 1 = folder
  playlist_id_parent: number | null;
}

export interface PlaylistContentRow {
  playlist_id: number;
  content_id: number;
  sequenceNo: number;
}

// ============================================================================
// Device Property
// ============================================================================

export interface PropertyRow {
  deviceName: string | null;
  dbVersion: string | null;
  numberOfContents: number | null;
  createdDate: string | null;
  backGroundColorType: number | null;
  myTagMasterDBID: number | null;
}

// ============================================================================
// Cue Kind Constants
// ============================================================================

/**
 * Cue point types based on the 'kind' field in the cue table.
 *
 * Note: These values may vary. Verify with actual data.
 */
export const CueKind = {
  MEMORY_CUE: 0,
  HOT_CUE: 1,
  // Additional types may exist
} as const;

/**
 * Playlist attribute types based on the 'attribute' field.
 */
export const PlaylistAttribute = {
  PLAYLIST: 0,
  FOLDER: 1,
} as const;

// ============================================================================
// MyTag (User Tags)
// ============================================================================

export interface MyTagRow {
  myTag_id: number;
  sequenceNo: number | null;
  name: string | null;
  attribute: number | null; // 0 = tag, 1 = folder
  myTag_id_parent: number | null;
}

export interface MyTagContentRow {
  myTag_id: number;
  content_id: number;
}

/**
 * MyTag attribute types based on the 'attribute' field.
 */
export const MyTagAttribute = {
  TAG: 0,
  FOLDER: 1,
} as const;

// ============================================================================
// History (Play History)
// ============================================================================

export interface HistoryRow {
  history_id: number;
  sequenceNo: number | null;
  name: string | null;
  attribute: number | null;
  history_id_parent: number | null;
}

export interface HistoryContentRow {
  history_id: number;
  content_id: number;
  sequenceNo: number;
}

// ============================================================================
// Hot Cue Bank List
// ============================================================================

export interface HotCueBankListRow {
  hotCueBankList_id: number;
  sequenceNo: number | null;
  name: string | null;
  image_id: number | null;
  attribute: number | null;
  hotCueBankList_id_parent: number | null;
}

export interface HotCueBankListCueRow {
  hotCueBankList_id: number;
  cue_id: number;
  sequenceNo: number;
}

// ============================================================================
// Menu Configuration
// ============================================================================

export interface MenuItemRow {
  menuItem_id: number;
  kind: number | null;
  name: string | null;
}

export interface CategoryRow {
  category_id: number;
  menuItem_id: number | null;
  sequenceNo: number | null;
  isVisible: number | null; // boolean as 0/1
}

export interface SortRow {
  sort_id: number;
  menuItem_id: number | null;
  sequenceNo: number | null;
  isVisible: number | null; // boolean as 0/1
  isSelectedAsSubColumn: number | null; // boolean as 0/1
}

// ============================================================================
// Recommended/Similar Tracks
// ============================================================================

export interface RecommendedLikeRow {
  content_id_1: number;
  content_id_2: number;
  rating: number | null;
  createdDate: number | null;
}

// ============================================================================
// Menu Item Kind Constants
// ============================================================================

/**
 * Menu item kinds for browsing categories.
 * These match the 'kind' field in the menuItem table.
 */
export const MenuItemKind = {
  GENRE: 128,
  ARTIST: 129,
  ALBUM: 130,
  TRACK: 131,
  PLAYLIST: 132,
  BPM: 133,
  RATING: 134,
  YEAR: 135,
  REMIXER: 136,
  LABEL: 137,
  ORIGINAL_ARTIST: 138,
  KEY: 139,
  DATE_ADDED: 140,
  CUE: 141,
  COLOR: 142,
  FOLDER: 144,
  SEARCH: 145,
  TIME: 146,
  BITRATE: 147,
  FILE_NAME: 148,
  HISTORY: 149,
  COMMENTS: 150,
  DJ_PLAY_COUNT: 151,
  HOT_CUE_BANK: 152,
  DEFAULT: 161,
  ALPHABET: 162,
  MATCHING: 170,
} as const;
