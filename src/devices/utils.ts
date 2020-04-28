import ip from 'ip-address';

import {PROLINK_HEADER} from 'src/constants';
import {Device} from 'src/types';

/**
 * Converts a announce packet to a device object.
 */
export function deviceFromPacket(packet: Buffer): Device {
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    throw new Error('Announce packet does not start with expected header');
  }

  if (packet[0x0a] != 0x06) {
    throw new Error('Packet is not an announce packet');
  }

  const name = packet
    .slice(0x0c, 0x0c + 20)
    .toString()
    .replace(/\0/g, '');

  return {
    name,
    id: packet[0x24],
    type: packet[0x34],
    macAddr: new Uint8Array(packet.slice(0x26, 0x26 + 6)),
    ip: ip.Address4.fromInteger(packet.readUInt32BE(0x2c)),
  };
}
