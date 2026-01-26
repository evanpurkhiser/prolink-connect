import {MetadataORM} from 'src/localdb/orm';
import {
  BeatGrid,
  CueAndLoop,
  ExtendedCue,
  SongStructure,
  WaveformHD,
  WaveformPreviewData,
} from 'src/types';
import {TelemetrySpan as Span} from 'src/utils/telemetry';

/**
 * The provided function should resolve ANLZ files into buffers. Typically
 * you would just read the file, but in the case of the prolink network, this
 * would handle loading the file over NFS.
 */
export type AnlzResolver = (path: string) => Promise<Buffer>;

/**
 * Data returned from loading DAT anlz files
 */
export interface AnlzResponseDAT {
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
export interface AnlzResponseEXT {
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

export interface AnlzResponse {
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
export interface HydrationOptions {
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
