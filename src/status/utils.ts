import {CDJStatus, MediaSlotInfo} from 'src/types';
import {PROLINK_HEADER} from 'src/constants';

export function statusFromPacket(packet: Buffer) {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    throw new Error('CDJ status packet does not start with the expected header');
  }

  // Rekordbox sends some short status packets that we can just ignore.
  if (packet.length < 0xff) {
    return;
  }

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
    trackBPM: packet.readUInt16BE(0x92) / 100,
    sliderPitch: calcPitch(packet.slice(0x8d, 0x8d + 3)),
    effectivePitch: calcPitch(packet.slice(0x99, 0x99 + 3)),
    beatInMeasure: packet[0xa6],
    beatsUntilCue: packet.readUInt16BE(0xa4),
    beat: packet.readUInt32BE(0xa0),
    packetNum: packet.readUInt32BE(0xc8),
  };

  return status;
}

export function mediaSlotFromPacket(packet: Buffer) {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    throw new Error('CDJ media slot packet does not start with the expected header');
  }

  if (packet[0x0a] !== 0x06) {
    return;
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

  const unknownText = packet
    .slice(0x84, 0x84 + 20)
    .toString()
    .replace(/\0/g, '');

  console.log(`unknown value: '${unknownText}'`);

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
 * calcPitch converts a uint24 byte value into a flaot32 pitch.
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
