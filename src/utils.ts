import {SocketAsPromised} from 'dgram-as-promised';
import {networkInterfaces, NetworkInterfaceInfoIPv4, NetworkInterfaceInfo} from 'os';
import ip from 'ip-address';

import {PROLINK_HEADER, VIRTUAL_CDJ_FIRMWARE, VIRTUAL_CDJ_NAME} from 'src/constants';
import {Device, DeviceID, DeviceType} from 'src/types';

/**
 * Async version of udp socket read
 */
export async function udpRead(conn: SocketAsPromised) {
  return await new Promise<Buffer>(resolve => conn.socket.once('message', resolve));
}

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
export function buildName(device: Device): Uint8Array {
  const name = new Uint8Array(20);
  name.set(Buffer.from(device.name, 'ascii'));

  return name;
}

/**
 * Determines the interface that routes the given address by comparing the
 * masked addresses. This type of information is generally determined through
 * the kernels routing table, but for sake of cross-platform compatibility, we
 * do some rudimentary lookup.
 */
export function getMatchingInterface(ipAddr: ip.Address4) {
  const flatList = Object.entries(networkInterfaces()).reduce(
    (acc, [name, info]) => acc.concat(info.map(i => ({...i, name}))),
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
