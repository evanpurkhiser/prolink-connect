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
