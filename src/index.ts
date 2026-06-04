export * from './entities';
export * from './mixstatus';
export * from './network';
export {default as PositionEmitter} from './status/position';

// Passive mode (pcap-based monitoring without announcing a VCDJ)
export * from './passive';

// Artwork extraction
export type {FileReader as ArtworkFileReader, ExtractedArtwork} from './artwork';
export {
  extractArtwork,
  extractArtworkFromDevice,
  isArtworkExtractionSupported,
  PictureType,
} from './artwork';

// Full metadata extraction (title, artist, album, BPM, key, genre, artwork)
export type {ExtractedMetadata} from './metadata';
export {
  extractFullMetadata,
  extractMetadataFromDevice,
  isMetadataExtractionSupported,
} from './metadata';

// ANLZ file loading (for analysis data: beat grid, cues, phrases, waveforms)
export type {
  AnlzResolver,
  AnlzResponse,
  AnlzResponse2EX,
  AnlzResponseDAT,
  AnlzResponseEXT,
} from './localdb/rekordbox';
export {loadAnlz} from './localdb/rekordbox';
export {fetchFile} from './nfs';

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
export type {Logger} from './logger';
export {noopLogger} from './logger';

// Types are exported last to avoid overwriting values with type-only exports
export * from './types';
