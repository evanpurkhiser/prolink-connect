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
export interface State {
  /**
   * The device reporting this status.
   */
  deviceId: number;
  /**
   * The ID of the track loaded on the device.
   *
   * 0 When no track is loaded.
   */
  trackId: number;
  /**
   * The device ID the track is loaded from.
   *
   * For example if you have two CDJs and you've loaded a track over the 'LINK',
   * this will be the ID of the player with the USB media device connected to it.
   */
  trackDeviceId: DeviceID;
  /**
   * The MediaSlot the track is loaded from. For example a SD card or USB device.
   */
  trackSlot: MediaSlot;
  /**
   * The TrackType of the track, for example a CD or Rekordbox analyzed track.
   */
  trackType: TrackType;
  /**
   * The current play state of the CDJ.
   */
  playState: PlayState;
  /**
   * Whether the CDJ is currently reporting itself as 'on-air'.
   *
   * This is indicated by the red ring around the platter on the CDJ Nexus models.
   * A DJM mixer must be ont he network for the CDJ to report this as true.
   */
  isOnAir: boolean;
  /**
   * Whether the CDJ is synced.
   */
  isSync: boolean;
  /**
   * Whether the CDJ is the master player.
   */
  isMaster: boolean;
  /**
   * Whether the CDJ is in an emergency state (emergecy loop / emergency mode
   * on newer players)
   */
  isEmergencyMode: boolean;
  /**
   * The BPM of the loaded track. null if no track is loaded or the BPM is unknown.
   */
  trackBPM: number | null;
  /**
   * The "effective" pitch of the plyaer. This is reported anytime the jogwheel is
   * nudged, the CDJ spins down by pausing with the vinyl stop knob not at 0, or
   * by holding the platter.
   */
  effectivePitch: number;
  /**
   * The current slider pitch
   */
  sliderPitch: number;
  /**
   * The current beat within the measure. 1-4. 0 when no track is loaded.
   */
  beatInMeasure: number;
  /**
   * Number of beats remaining until the next cue point is reached. Null if there
   * is no next cue point
   */
  beatsUntilCue: number | null;
  /**
   * The beat 'timestamp' of the track. Can be used to compute absolute track time
   * given the slider pitch.
   */
  beat: number | null;
  /**
   * A counter that increments for every status packet sent.
   */
  packetNum: number;
}

/**
 * Absolute position information from CDJ-3000+ devices.
 * Sent every 30ms on port 50001 while a track is loaded.
 * Provides precise playhead position independent of beat grid.
 */
export interface PositionState {
  /**
   * The device ID sending this position update.
   */
  deviceId: number;
  /**
   * Track length in seconds (rounded down to nearest second).
   */
  trackLength: number;
  /**
   * Absolute playhead position in milliseconds.
   */
  playhead: number;
  /**
   * Pitch slider value as shown on screen.
   * For example, 3.26% is represented as 3.26.
   */
  pitch: number;
  /**
   * Effective BPM (track BPM adjusted by pitch) as shown on screen.
   * null if BPM is unknown.
   */
  bpm: number | null;
}

/**
 * On-Air status from DJM mixer.
 * Broadcast by the mixer to indicate which channels are currently audible.
 * Supports both 4-channel (DJM-900/1000) and 6-channel (DJM-V10) mixers.
 */
export interface OnAirStatus {
  /**
   * The mixer device ID (typically 33 / 0x21).
   */
  deviceId: number;
  /**
   * On-air flags for channels 1-4 (always present).
   * 0x00 = channel is off-air (silenced)
   * 0x01 = channel is on-air (audible)
   */
  channels: {
    1: boolean;
    2: boolean;
    3: boolean;
    4: boolean;
    5?: boolean;
    6?: boolean;
  };
  /**
   * Whether this is a 6-channel variant (CDJ-3000 + DJM-V10).
   * Determined by packet subtype (0x00 = 4-channel, 0x03 = 6-channel).
   */
  isSixChannel: boolean;
}
