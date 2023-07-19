import * as ip from 'ip-address';

import {NetworkInterfaceInfo, NetworkInterfaceInfoIPv4, networkInterfaces} from 'os';

import {Device, MediaSlot, TrackType} from 'src/types';

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
    (acc, [name, info]) =>
      info !== undefined ? acc.concat(info.map(i => ({...i, name}))) : acc,
    [] as Array<{name: string} & NetworkInterfaceInfo>
  );

  let matchedIface: (NetworkInterfaceInfoIPv4 & {name: string}) | null = null;
  let matchedSubnet = 0;

  for (const iface of flatList) {
    const {internal, cidr} = iface;

    if (iface.family !== 'IPv4' || internal || cidr === null) {
      continue;
    }

    const ifaceAddr = new ip.Address4(cidr);

    if (ipAddr.isInSubnet(ifaceAddr) && ifaceAddr.subnetMask > matchedSubnet) {
      matchedIface = iface;
      matchedSubnet = ifaceAddr.subnetMask;
    }
  }

  return matchedIface;
}

/**
 * Given a BPM and pitch value, compute how many seconds per beat
 */
export function bpmToSeconds(bpm: number, pitch: number) {
  const bps = ((pitch / 100) * bpm + bpm) / 60;
  return 1 / bps;
}

const slotNames = Object.fromEntries(
  Object.entries(MediaSlot).map(e => [e[1], e[0].toLowerCase()])
);

/**
 * Returns a string representation of a media slot
 */
export function getSlotName(slot: MediaSlot) {
  return slotNames[slot];
}

const trackTypeNames = Object.fromEntries(
  Object.entries(TrackType).map(e => [e[1], e[0].toLowerCase()])
);

/**
 * Returns a string representation of a track type
 */
export function getTrackTypeName(type: TrackType) {
  return trackTypeNames[type];
}
