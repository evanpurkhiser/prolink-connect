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
 * Track load slot flags
 */
export enum TrackSlot {
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
    playerID: number;
    trackID: number;
    trackDevice: DeviceID;
    trackSlot: TrackSlot;
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
 * indicates what count within the measure it is.
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
