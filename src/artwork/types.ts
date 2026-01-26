/**
 * Extracted artwork from an audio file
 */
export interface ExtractedArtwork {
  data: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif';
  width?: number;
  height?: number;
  pictureType?: PictureType;
}

/**
 * Standard picture types from ID3v2 / FLAC specs
 */
export enum PictureType {
  Other = 0,
  FileIcon32x32 = 1,
  OtherFileIcon = 2,
  FrontCover = 3,
  BackCover = 4,
  LeafletPage = 5,
  Media = 6,
  LeadArtist = 7,
  Artist = 8,
  Conductor = 9,
  Band = 10,
  Composer = 11,
  Lyricist = 12,
  RecordingLocation = 13,
  DuringRecording = 14,
  DuringPerformance = 15,
  MovieScreenCapture = 16,
  BrightColoredFish = 17,
  Illustration = 18,
  BandLogotype = 19,
  PublisherLogotype = 20,
}

/**
 * Interface for reading file data at arbitrary offsets.
 */
export interface FileReader {
  readonly size: number;
  readonly extension: string;
  read(offset: number, length: number): Promise<Buffer>;
}
