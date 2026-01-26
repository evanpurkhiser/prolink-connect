import type {Address4} from 'ip-address';

import type {Playlist, Track} from './entities';

export * as CDJStatus from 'src/status/types';

/**
 * Re-export various types for the types only compile target
 */

export type {
  Album,
  Artist,
  Artwork,
  Color,
  Genre,
  Key,
  Label,
  Playlist,
  Track,
} from './entities';
export type {HydrationProgress} from './localdb/rekordbox';
export type {MixstatusConfig, MixstatusProcessor} from './mixstatus';
// Note: ProlinkNetwork is exported as a class from ./network, not re-exported here as type-only
// to preserve method signatures like close()
export type {ConnectedProlinkNetwork, NetworkConfig} from './network';
export type {FetchProgress} from './nfs';

/**
 * Known device types on the network
 */
export enum DeviceType {
  CDJ = 0x01,
  Mixer = 0x03,
  Rekordbox = 0x04,
}

/**
 * The 8-bit identifier of the device on the network
 */
export type DeviceID = number;

/**
 * Represents a device on the prolink network.
 */
export interface Device {
  name: string;
  id: DeviceID;
  type: DeviceType;
  macAddr: Uint8Array;
  ip: Address4;
  lastActive?: Date;
}

/**
 * Details of a particular media slot on the CDJ
 */
export interface MediaSlotInfo {
  /**
   * The device the slot physically exists on
   */
  deviceId: DeviceID;
  /**
   * The slot type
   */
  slot: MediaSlot;
  /**
   * The name of the media connected
   */
  name: string;
  /**
   * The rekordbox configured color of the media connected
   */
  color: MediaColor;
  /**
   * Creation date
   */
  createdDate: Date;
  /**
   * Number of free bytes available on the media
   */
  freeBytes: bigint;
  /**
   * Number of bytes used on the media
   */
  totalBytes: bigint;
  /**
   * Specifies the available tracks type on the media
   */
  tracksType: TrackType;
  /**
   * Total number of rekordbox tracks on the media. Will be zero if there is
   * no rekordbox database on the media
   */
  trackCount: number;
  /**
   * Same as track count, except for playlists
   */
  playlistCount: number;
  /**
   * True when a rekordbox 'my settings' file has been exported to the media
   */
  hasSettings: boolean;
}

export enum MediaColor {
  Default = 0x00,
  Pink = 0x01,
  Red = 0x02,
  Orange = 0x03,
  Yellow = 0x04,
  Green = 0x05,
  Aqua = 0x06,
  Blue = 0x07,
  Purple = 0x08,
}

/**
 * A slot where media is present on the CDJ
 */
export enum MediaSlot {
  Empty = 0x00,
  CD = 0x01,
  SD = 0x02,
  USB = 0x03,
  RB = 0x04,
}

/**
 * Track type flags
 */
export enum TrackType {
  None = 0x00,
  RB = 0x01,
  Unanalyzed = 0x02,
  AudioCD = 0x05,
}

/**
 * A beat grid is a series of offsets from the start of the track. Each offset
 * indicates what count within the measure it is along with the BPM.
 */
export type BeatGrid = Array<{
  /**
   * Offset from the beginning of track in milliseconds of this beat.
   */
  offset: number;
  /**
   * The count of this particular beat within the measure
   */
  count: 1 | 2 | 3 | 4;
  /**
   * The BPM at this beat.
   */
  bpm: number;
}>;

/**
 * A waveform segment contains a height and 'whiteness' value.
 */
interface WaveformSegment {
  /**
   * The height this segment in the waveform. Ranges from 0 - 31.
   */
  height: number;
  /**
   * The level of "whiteness" of the waveform. 0 being completely blue, and 1
   * being completely white.
   */
  whiteness: number;
}

/**
 * A HD waveform segment contains the height of the waveform, and it's color
 * represented as RGB values.
 */
interface WaveformHDSegment {
  /**
   * The height this segment in the waveform. Ranges from 0 - 31.
   */
  height: number;
  /**
   * the RGB value, each channel ranges from 0-1 for the segment.
   */
  color: [number, number, number];
}

/**
 * The waveform preview will be 400 segments of data.
 */
export type WaveformPreview = WaveformSegment[];

/**
 * Detailed waveforms have 150 segments per second of audio (150 'half frames'
 * per second of audio).
 */
export type WaveformDetailed = WaveformSegment[];

/**
 * HD waveforms have 150 segments per second of audio (150 'half frames' per
 * second of audio).
 */
export type WaveformHD = WaveformHDSegment[];

/**
 * The result of looking up track waveforms
 */
export interface Waveforms {
  /**
   * The full-size and full-color waveform
   */
  waveformHd: WaveformHD;

  // TODO: Add other waveform types
}

/**
 * A hotcue button label
 */
export enum HotcueButton {
  A = 1,
  B,
  C,
  D,
  E,
  F,
  G,
  H,
}

/**
 * When a custom color is not configured the cue point will be one of these
 * colors.
 */
export enum CueColor {
  None = 0x00,
  Blank = 0x15,
  Magenta = 0x31,
  Violet = 0x38,
  Fuchsia = 0x3c,
  LightSlateBlue = 0x3e,
  Blue = 0x01,
  SteelBlue = 0x05,
  Aqua = 0x09,
  SeaGreen = 0x0e,
  Teal = 0x12,
  Green = 0x16,
  Lime = 0x1a,
  Olive = 0x1e,
  Yellow = 0x20,
  Orange = 0x26,
  Red = 0x2a,
  Pink = 0x2d,
}

/**
 * Represents a single cue point. On older exports the label and color may be
 * undefined.
 */
export interface CuePoint {
  type: 'cue_point';
  /**
   * Number of milliseconds from the start of the track.
   */
  offset: number;
  /**
   * The comment associated to the cue point
   */
  label?: string;
  /**
   * RGB values of the hotcue color
   */
  color?: CueColor;
}

type BareCuePoint = Omit<CuePoint, 'type'>;

/**
 * A loop, similar to a cue point, but includes a length.
 */
export type Loop = BareCuePoint & {
  type: 'loop';
  /**
   * The length in milliseconds of the loop
   */
  length: number;
};

/**
 * A hotcue is like a cue point, but also includes the button it is assigned to.
 */
export type Hotcue = BareCuePoint & {
  type: 'hot_cue';
  /**
   * Which hotcue button this hotcue is assigned to.
   */
  button: HotcueButton;
};

/**
 * A hot loop, this is the union of a hotcue and a loop.
 */
export type Hotloop = {type: 'hot_loop'} & (Omit<Hotcue, 'type'> & Omit<Loop, 'type'>);

export type CueAndLoop = CuePoint | Loop | Hotcue | Hotloop;

/**
 * Extended cue with color and comment support (PCO2 tag from rekordbox).
 * Includes additional metadata like RGB colors, comments, and quantized loop information.
 */
export interface ExtendedCue {
  /**
   * Hot cue number (0 for memory points, 1-8 for hot cues A-H)
   */
  hotCue: number;
  /**
   * Type of cue: 1 = simple position/cue, 2 = loop
   */
  type: 1 | 2;
  /**
   * Position in milliseconds from the start of the track
   */
  time: number;
  /**
   * For loops, the end position in milliseconds
   */
  loopTime?: number;
  /**
   * Color ID referencing the color table (for memory points/loops)
   */
  colorId?: number;
  /**
   * Color code for the hot cue palette (0x00 = default green, 0x01-0x3e = palette colors)
   */
  colorCode?: number;
  /**
   * RGB color values used to illuminate the player's RGB LEDs
   */
  colorRgb?: {r: number; g: number; b: number};
  /**
   * User-assigned comment text for the cue
   */
  comment?: string;
  /**
   * For quantized loops, the numerator of the loop size fraction (e.g., 4 for a 4-beat loop)
   */
  loopNumerator?: number;
  /**
   * For quantized loops, the denominator of the loop size fraction (e.g., 1 for a 4-beat loop)
   */
  loopDenominator?: number;
}

/**
 * A phrase within a track's song structure
 */
export interface Phrase {
  /**
   * Sequential phrase number starting from 1
   */
  index: number;
  /**
   * Beat number where this phrase begins
   */
  beat: number;
  /**
   * Raw phrase kind value from rekordbox
   */
  kind: number;
  /**
   * Human-readable phrase type (e.g., "Intro", "Verse 1", "Chorus")
   */
  phraseType: string;
  /**
   * Whether this phrase has a fill-in section (non-zero if present)
   */
  fill?: number;
  /**
   * Beat number where the fill-in begins (if present)
   */
  fillBeat?: number;
}

/**
 * Song structure / phrase analysis (PSSI tag from rekordbox).
 * Used by CDJ-3000 players for phrase-based navigation and lighting control.
 */
export interface SongStructure {
  /**
   * Overall mood classification of the track
   */
  mood: 'high' | 'mid' | 'low';
  /**
   * Stylistic bank assigned for lighting control
   */
  bank:
    | 'default'
    | 'cool'
    | 'natural'
    | 'hot'
    | 'subtle'
    | 'warm'
    | 'vivid'
    | 'club_1'
    | 'club_2';
  /**
   * Beat number where the last phrase ends (track may continue after this)
   */
  endBeat: number;
  /**
   * List of identified phrases in the track
   */
  phrases: Phrase[];
}

/**
 * Monochrome waveform preview data (PWAV/PWV2 tags).
 * PWAV contains 400 bytes, PWV2 contains 100 bytes.
 */
export interface WaveformPreviewData {
  /**
   * Raw waveform data - each byte encodes height and whiteness
   */
  data: Uint8Array;
}

/**
 * Represents the contents of a playlist
 */
export interface PlaylistContents {
  /**
   * The playlists in this playlist.
   */
  playlists: Playlist[];
  /**
   * The folders in this playlist.
   */
  folders: Playlist[];
  /**
   * The tracks in this playlist. This is an AsyncIterator as looking up track
   * metadata may be slow when connected to the remote database.
   */
  tracks: AsyncIterable<Track>;
  /**
   * The total number of tracks in this playlist.
   */
  totalTracks: number;
}

export enum NetworkState {
  /**
   * The network is offline when we don't have an open connection to the network
   * (no connection to the announcement and or status UDP socket is present).
   */
  Offline,
  /**
   * The network is online when we have opened sockets to the network, but have
   * not yet started announcing ourselves as a virtual CDJ.
   */
  Online,
  /**
   * The network is connected once we have heard from another device on the network
   */
  Connected,
  /**
   * The network may have failed to connect if we aren't able to open the
   * announcement and or status UDP socket.
   */
  Failed,
}

/**
 * Mixstatus reporting modes specify how the mixstatus processor will determine when a new
 * track is 'now playing'.
 */
export enum MixstatusMode {
  /**
   * Tracks will be smartly marked as playing following rules:
   *
   * - The track that has been in the play state with the CDJ in the "on air" state
   *   for the longest period of time (allowing for a configurable length of
   *   interruption with allowedInterruptBeats) is considered to be the active
   *   track that incoming tracks will be compared against.
   *
   * - A incoming track will immediately be reported as nowPlaying if it is on
   *   air, playing, and the last active track has been cued.
   *
   * - A incoming track will be reported as nowPlaying if the active track has
   *   not been on air or has not been playing for the configured
   *   allowedInterruptBeats.
   *
   * - A incoming track will be reported as nowPlaying if it has played
   *   consecutively (with allowedInterruptBeats honored for the incoming track)
   *   for the configured beatsUntilReported.
   */
  SmartTiming,
  /**
   * Tracks will not be reported after the beatsUntilReported AND will ONLY
   * be reported if the other track has gone into a non-playing play state, or
   * taken off air (when useOnAirStatus is enabled).
   */
  WaitsForSilence,
  /**
   * The track will simply be reported only after the player becomes master.
   */
  FollowsMaster,
}
