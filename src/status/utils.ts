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
