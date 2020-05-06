import ip from 'ip-address';

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
 * Represents a device on the PROLINK network.
 */
export type Device = {
  name: string;
  id: DeviceID;
  type: DeviceType;
  macAddr: Uint8Array;
  ip: ip.Address4;
  lastActive?: Date;
};

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

export module CDJStatus {
  /**
   * Status flag bitmasks
   */
  export enum StatusFlag {
    OnAir = 1 << 3,
    Sync = 1 << 4,
    Master = 1 << 5,
    Playing = 1 << 6,
  }

  /**
   * Play state flags
   */
  export enum PlayState {
    Empty = 0x00,
    Loading = 0x02,
    Playing = 0x03,
    Looping = 0x04,
    Paused = 0x05,
    Cued = 0x06,
    Cuing = 0x07,
    Searching = 0x09,
    SpunDown = 0x0e,
    Ended = 0x11,
  }

  /**
   * Represents various details about the current state of the CDJ.
   */
  export type State = {
    deviceId: number;
    trackId: number;
    trackDeviceId: DeviceID;
    trackSlot: MediaSlot;
    trackType: TrackType;
    playState: PlayState;
    isOnAir: boolean;
    isSync: boolean;
    isMaster: boolean;
    trackBPM: number;
    effectivePitch: number;
    sliderPitch: number;
    beatInMeasure: number;
    beatsUntilCue: number;
    beat: number;
    packetNum: number;
  };
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
type WaveformSegment = {
  /**
   * The height this segment in the waveform. Ranges from 0 - 31.
   */
  height: number;
  /**
   * The level of "whiteness" of the waveform. 0 being completely blue, and 1
   * being completely white.
   */
  whiteness: number;
};

/**
 * A HD waveform segment contains the height of the waveform, and it's color
 * represented as RGB values.
 */
type WaveformHDSegment = {
  /**
   * The height this segment in the waveform. Ranges from 0 - 31.
   */
  height: number;
  /**
   * the RGB value, each channel ranges from 0-1 for the segment.
   */
  color: [number, number, number];
};

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
export type CuePoint = {
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
};

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
export type Hotloop = {type: 'hot_loop'} & Omit<Hotcue & Loop, 'type'>;

export type CueAndLoop = CuePoint | Loop | Hotcue | Hotloop;
