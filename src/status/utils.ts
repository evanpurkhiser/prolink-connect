import {PROLINK_HEADER} from 'src/constants';
import {CDJStatus, MediaSlotInfo} from 'src/types';

const MAX_INT32 = Math.pow(2, 32) - 1;
const MAX_INT16 = Math.pow(2, 16) - 1;
const MAX_INT9 = Math.pow(2, 9) - 1;

export function statusFromPacket(packet: Buffer) {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    throw new Error('CDJ status packet does not start with the expected header');
  }

  // Rekordbox sends some short status packets that we can just ignore.
  if (packet.length < 0xc8) {
    return undefined;
  }

  // No track loaded: BPM = MAX_INT16
  const rawBPM = packet.readUInt16BE(0x92);
  const trackBPM = rawBPM === MAX_INT16 ? null : rawBPM / 100;

  // No next cue: beatsUntilCue = MAX_INT9
  const rawBeatsUntilCue = packet.readUInt16BE(0xa4);
  const beatsUntilCue = rawBeatsUntilCue === MAX_INT9 ? null : rawBeatsUntilCue;

  // No track loaded: beat = MAX_INT32
  const rawBeat = packet.readUInt32BE(0xa0);
  const beat = rawBeat === MAX_INT32 ? null : rawBeat;

  const status: CDJStatus.State = {
    deviceId: packet[0x21],
    trackId: packet.readUInt32BE(0x2c),
    trackDeviceId: packet[0x28],
    trackSlot: packet[0x29],
    trackType: packet[0x2a],
    playState: packet[0x7b],
    isOnAir: (packet[0x89] & CDJStatus.StatusFlag.OnAir) !== 0,
    isSync: (packet[0x89] & CDJStatus.StatusFlag.Sync) !== 0,
    isMaster: (packet[0x89] & CDJStatus.StatusFlag.Master) !== 0,
    isEmergencyMode: !!packet[0xba],
    trackBPM,
    sliderPitch: calcPitch(packet.slice(0x8d, 0x8d + 3)),
    effectivePitch: calcPitch(packet.slice(0x99, 0x99 + 3)),
    beatInMeasure: packet[0xa6],
    beatsUntilCue,
    beat,
    packetNum: packet.readUInt32BE(0xc8),
  };

  return status;
}

export function mediaSlotFromPacket(packet: Buffer) {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    throw new Error('CDJ media slot packet does not start with the expected header');
  }

  if (packet[0x0a] !== 0x06) {
    return undefined;
  }

  const name = packet
    .slice(0x2c, 0x0c + 40)
    .toString()
    .replace(/\0/g, '');

  const createdDate = new Date(
    packet
      .slice(0x6c, 0x6c + 24)
      .toString()
      .replace(/\0/g, '')
  );

  const deviceId = packet[0x27];
  const slot = packet[0x2b];

  const trackCount = packet.readUInt16BE(0xa6);
  const tracksType = packet[0xaa];
  const hasSettings = !!packet[0xab];
  const playlistCount = packet.readUInt16BE(0xae);
  const color = packet.readUInt8(0xa8);
  const totalBytes = packet.readBigUInt64BE(0xb0);
  const freeBytes = packet.readBigUInt64BE(0xb8);

  const info: MediaSlotInfo = {
    deviceId,
    slot,
    name,
    color,
    createdDate,
    freeBytes,
    totalBytes,
    tracksType,
    trackCount,
    playlistCount,
    hasSettings,
  };

  return info;
}

/**
 * calcPitch converts a uint24 byte value into a float32 pitch.
 *
 * The pitch information ranges from 0x000000 (meaning -100%, complete stop) to
 * 0x200000 (+100%).
 */
function calcPitch(pitch: Buffer) {
  const value = Buffer.from([0x0, ...pitch]).readUInt32BE();
  const relativeZero = 0x100000;

  const computed = ((value - relativeZero) / relativeZero) * 100;

  return +computed.toFixed(2);
}

/**
 * Parse absolute position packet from CDJ-3000+ devices.
 * These packets are sent every 30ms on port 50001 while a track is loaded.
 * Packet structure: subtype 0x00, lenr varies based on device.
 */
export function positionFromPacket(packet: Buffer): CDJStatus.PositionState | undefined {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    return undefined;
  }

  // Check if this is a position packet (subtype 0x00)
  if (packet[0x20] !== 0x00) {
    return undefined;
  }

  // Check minimum length for position packet
  const lenr = packet.readUInt16BE(0x22);
  if (lenr < 0x0c || packet.length < 0x34) {
    return undefined;
  }

  const deviceId = packet[0x21];
  const trackLength = packet.readUInt32BE(0x24);
  const playhead = packet.readUInt32BE(0x28);

  // Parse pitch: 32-bit signed integer representing pitch × 64 × 100
  // To get percentage: divide by 6400
  const rawPitch = packet.readInt32BE(0x2c);
  const pitch = rawPitch / 6400;

  // Parse BPM: multiply by 10, or null if 0xffffffff
  const rawBPM = packet.readUInt32BE(0x30);
  const bpm = rawBPM === 0xffffffff ? null : rawBPM / 10;

  const position: CDJStatus.PositionState = {
    deviceId,
    trackLength,
    playhead,
    pitch,
    bpm,
  };

  return position;
}

/**
 * Parse on-air status packet from DJM mixer.
 * The mixer broadcasts which channels are currently audible.
 * Supports both 4-channel (subtype 0x00) and 6-channel (subtype 0x03) variants.
 *
 * Packet structure:
 * - 4-channel: subtype 0x00, length 0x0009 (9 data bytes: F1 F2 F3 F4 00 00 00 00 00)
 * - 6-channel: subtype 0x03, length 0x0011 (17 data bytes: F1 F2 F3 F4 00 00 00 00 00 F5 F6 00 30 00 00 00 00 00)
 */
export function onAirFromPacket(packet: Buffer): CDJStatus.OnAirStatus | undefined {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    return undefined;
  }

  const subtype = packet[0x20];
  const lenr = packet.readUInt16BE(0x22);

  // Check for 4-channel variant (subtype 0x00, length 0x0009)
  if (subtype === 0x00 && lenr === 0x0009 && packet.length >= 0x2e) {
    const deviceId = packet[0x21];
    const channels = {
      1: packet[0x24] !== 0x00,
      2: packet[0x25] !== 0x00,
      3: packet[0x26] !== 0x00,
      4: packet[0x27] !== 0x00,
    };

    const onAir: CDJStatus.OnAirStatus = {
      deviceId,
      channels,
      isSixChannel: false,
    };

    return onAir;
  }

  // Check for 6-channel variant (subtype 0x03, length 0x0011)
  if (subtype === 0x03 && lenr === 0x0011 && packet.length >= 0x36) {
    const deviceId = packet[0x21];
    const channels = {
      1: packet[0x24] !== 0x00,
      2: packet[0x25] !== 0x00,
      3: packet[0x26] !== 0x00,
      4: packet[0x27] !== 0x00,
      5: packet[0x2e] !== 0x00,
      6: packet[0x2f] !== 0x00,
    };

    const onAir: CDJStatus.OnAirStatus = {
      deviceId,
      channels,
      isSixChannel: true,
    };

    return onAir;
  }

  return undefined;
}
