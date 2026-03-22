export * from './entities';
export * from './mixstatus';
export * from './network';
export {default as PositionEmitter} from './status/position';

// Passive mode (pcap-based monitoring without announcing a VCDJ)
export * from './passive';

// Artwork extraction
export {
  extractArtwork,
  extractArtworkFromDevice,
  isArtworkExtractionSupported,
  PictureType,
} from './artwork';
export type {ExtractedArtwork, FileReader as ArtworkFileReader} from './artwork';

// Full metadata extraction (title, artist, album, BPM, key, genre, artwork)
export {
  extractFullMetadata,
  extractMetadataFromDevice,
  isMetadataExtractionSupported,
} from './metadata';
export type {ExtractedMetadata} from './metadata';

// ANLZ file loading (for analysis data: beat grid, cues, phrases, waveforms)
export {loadAnlz} from './localdb/rekordbox';
export {fetchFile} from './nfs';
export type {AnlzResolver, AnlzResponse, AnlzResponse2EX, AnlzResponseDAT, AnlzResponseEXT} from './localdb/rekordbox';

// Database adapters (re-exported from onelibrary-connect)
export type {
  DatabaseAdapter,
  DatabasePreference,
  DatabaseType,
  PlaylistQueryResult,
} from 'onelibrary-connect';
export {OneLibraryAdapter} from 'onelibrary-connect';

// OneLibrary schema types (re-exported from onelibrary-connect)
export type {
  Category,
  DeviceProperty,
  HistorySession,
  HotCueBankList,
  MenuItem,
  MyTag,
  SortOption,
} from 'onelibrary-connect';

// Logger interface for pluggable logging
export {noopLogger} from './logger';
export type {Logger} from './logger';

// Types are exported last to avoid overwriting values with type-only exports
export * from './types';
