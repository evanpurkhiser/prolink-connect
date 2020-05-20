import {DeviceID, MediaSlot, TrackType} from 'src/types';

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
  PlatterHeld = 0x08,
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
