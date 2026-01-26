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

// Database adapters
export type {
  DatabaseAdapter,
  DatabasePreference,
  DatabaseType,
  PlaylistQueryResult,
} from './localdb/database-adapter';
export {OneLibraryAdapter} from './localdb/onelibrary';

// Types are exported last to avoid overwriting values with type-only exports
export * from './types';
