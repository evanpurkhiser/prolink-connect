import {DeviceID, CDJStatus} from 'src/types';
import {PROLINK_HEADER} from 'src/constants';

export function packetToStatus(packet: Buffer) {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    throw new Error('CDJ status packet does not start with the expected header');
  }

  if (packet.length < 0xff) {
    throw new Error('Invalid status packet');
  }

  console.log(packet[0x8d]);

  const status: CDJStatus.State = {
    playerID: packet[0x21],
    trackID: packet.readUInt32BE(0x2c),
    trackDevice: packet[0x28],
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

/**
 * calcPitch converts a uint24 byte value into a flaot32 pitch.
 *
 * The pitch information ranges from 0x000000 (meaning -100%, complete stop) to
 * 0x200000 (+100%).
 */
function calcPitch(pitch: Buffer) {
  const value = new Buffer([0x0, ...pitch]).readUInt32BE();
  const relativeZero = 0x100000;

  const computed = ((value - relativeZero) / relativeZero) * 100;

  return +computed.toFixed(2);
}
