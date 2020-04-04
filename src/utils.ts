import {networkInterfaces, NetworkInterfaceInfoIPv4, NetworkInterfaceInfo} from 'os';
import ip from 'ip-address';

import {PROLINK_HEADER, VIRTUAL_CDJ_FIRMWARE, VIRTUAL_CDJ_NAME} from 'src/constants';
import {Device, DeviceID, DeviceType} from 'src/types';

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

/**
 * Get the byte representation of the device name
 */
function buildName(device: Device): Uint8Array {
  const name = new Uint8Array(20);
  name.set(Buffer.from(device.name, 'ascii'));

  return name;
}

/**
 * constructs the announce packet that is sent on the PRO DJ LINK network to
 * announce a devices existence.
 */
export function getAnnouncePacket(device: Device): Uint8Array {
  // unknown padding bytes
  const unknown1 = [0x01, 0x02, 0x00, 0x36];
  const unknown2 = [0x01, 0x00, 0x00, 0x00];

  // The packet blow is constructed in the followig format:
  //
  //  - 0x00: 10 byte header
  //  - 0x0A: 02 byte announce packet type
  //  - 0x0c: 20 byte device name
  //  - 0x20: 04 byte unknown
  //  - 0x24: 01 byte for the player ID
  //  - 0x25: 01 byte for the player type
  //  - 0x26: 06 byte mac address
  //  - 0x2C: 04 byte IP address
  //  - 0x30: 04 byte unknown
  //  - 0x34: 01 byte for the player type
  //  - 0x35: 01 byte final padding

  const parts = [
    ...PROLINK_HEADER,
    ...[0x06, 0x00],
    ...buildName(device),
    ...unknown1,
    ...[device.id],
    ...[device.type],
    ...device.macAddr,
    ...device.ip.toArray(),
    ...unknown2,
    ...[device.type],
    ...[0x00],
  ];

  return Uint8Array.from(parts);
}

/**
 * Returns a mostly empty-state status packet. This is currently used to report
 * the virtual CDJs status, which *seems* to be required for the CDJ to send
 * metadata about some unanalyzed mp3 files.
 */
export function getStatusPacket(device: Device): Uint8Array {
  // NOTE: It seems that byte 0x68 and 0x75 MUST be 1 in order for the CDJ to
  //       correctly report mp3 metadata (again, only for some files).
  //       See https://github.com/brunchboy/dysentery/issues/15
  // NOTE: Byte 0xb6 MUST be 1 in order for the CDJ to not think that our
  //       device is "running an older firmware"
  //
  // prettier-ignore
  const b = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x03, 0x00, 0x00, 0xf8, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x9c, 0xff, 0xfe, 0x00, 0x10, 0x00, 0x00,
    0x7f, 0xff, 0xff, 0xff, 0x7f, 0xff, 0xff, 0xff, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
    0xff, 0xff, 0xff, 0xff, 0x01, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  // The following items get replaced in this format:
  //
  //  - 0x00: 10 byte header
  //  - 0x0B: 20 byte device name
  //  - 0x21: 01 byte device ID
  //  - 0x24: 01 byte device ID
  //  - 0x7C: 04 byte firmware string

  b.set(PROLINK_HEADER, 0x0b);
  b.set(Buffer.from(device.name, 'ascii'), 0x0b);
  b.set(new Uint8Array([device.id]), 0x21);
  b.set(new Uint8Array([device.id]), 0x24);
  b.set(Buffer.from(VIRTUAL_CDJ_FIRMWARE, 'ascii'), 0x7c);

  return b;
}

/**
 * Determines the interface that routes the given address by comparing the
 * masked addresses. This type of information is generally determined through
 * the kernels routing table, but for sake of cross-platform compatibility, we
 * do some rudimentary lookup.
 */
export function getMatchingInterface(ipAddr: ip.Address4) {
  const flatList = Object.entries(networkInterfaces()).reduce(
    (acc, [name, info]) => acc.concat(info.map((i) => ({...i, name}))),
    [] as ({name: string} & NetworkInterfaceInfo)[]
  );

  let matchedIface: (NetworkInterfaceInfoIPv4 & {name: string}) | null = null;
  let subnetMask = 0;

  for (const iface of flatList) {
    const {internal, cidr} = iface;

    if (iface.family !== 'IPv4' || internal || cidr === null) {
      continue;
    }

    const ifaceAddr = new ip.Address4(cidr);

    if (ipAddr.isInSubnet(ifaceAddr) && ifaceAddr.subnetMask > subnetMask) {
      matchedIface = iface;
      subnetMask = ifaceAddr.subnetMask;
    }
  }

  return matchedIface;
}

export function getBroadcastAddress(iface: NetworkInterfaceInfoIPv4) {
  const maskSplit = iface.netmask.split('.');

  // bitwise OR over the splitted NAND netmask, then glue them back together
  // with a dot character to form an ip we have to do a NAND operation because
  // of the 2-complements; getting rid of all the 'prepended' 1's with & 0xFF
  return iface.address
    .split('.')
    .map((e, i) => (~maskSplit[i] & 0xff) | Number(e))
    .join('.');
}

/**
 * Constructs a virtual CDJ Device.
 */
export const getVirtualCDJ = (iface: NetworkInterfaceInfoIPv4, id: DeviceID): Device => ({
  id,
  name: VIRTUAL_CDJ_NAME,
  type: DeviceType.CDJ,
  ip: new ip.Address4(iface.address),
  macAddr: new Uint8Array(iface.mac.split(':').map((s) => parseInt(s, 16))),
});
