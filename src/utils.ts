import {SocketAsPromised} from 'dgram-as-promised';
import {networkInterfaces, NetworkInterfaceInfoIPv4, NetworkInterfaceInfo} from 'os';
import ip from 'ip-address';

import {Device} from 'src/types';

/**
 * Async version of udp socket read
 */
export async function udpRead(conn: SocketAsPromised) {
  return await new Promise<Buffer>(resolve => conn.socket.once('message', resolve));
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
