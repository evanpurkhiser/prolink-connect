import {type NetworkInterfaceInfo, networkInterfaces} from 'os';

import {DatabasePreference} from 'src/localdb/database-adapter';
import {MixstatusProcessor} from 'src/mixstatus';

import {PassiveDeviceManager} from './devices';
import {PassiveLocalDatabase} from './localdb';
import {PcapAdapter} from './pcap-adapter';
import {PassivePositionEmitter} from './position';
import {PassiveRemoteDatabase} from './remotedb';
import {PassiveStatusEmitter} from './status';

export {
  AlphaThetaInterface,
  findAlphaThetaInterface,
  findAllAlphaThetaInterfaces,
  getArpCacheForInterface,
} from './alphatheta';
export {PassiveDeviceManager} from './devices';
export {PassiveLocalDatabase} from './localdb';
export {PacketInfo, PcapAdapter, PcapAdapterConfig} from './pcap-adapter';
export {PassivePositionEmitter} from './position';
export {PassiveRemoteDatabase} from './remotedb';
export {PassiveStatusEmitter} from './status';

export interface PassiveNetworkConfig {
  /**
   * Network interface name (e.g., 'en0', 'eth0', 'en15' for USB-connected devices)
   */
  iface: string;
  /**
   * Buffer size for packet capture in bytes
   * @default 10485760 (10MB)
   */
  bufferSize?: number;
  /**
   * Time in milliseconds after which a device is considered disconnected
   * @default 10000
   */
  deviceTimeout?: number;
  /**
   * Database format preference for loading rekordbox databases.
   *
   * - 'auto': Try OneLibrary first (rekordbox 7.x+), fall back to PDB (rekordbox 6.x)
   * - 'oneLibrary': Only use OneLibrary format (exportLibrary.db)
   * - 'pdb': Only use PDB format (export.pdb)
   *
   * @default 'auto'
   */
  databasePreference?: DatabasePreference;
}

/**
 * PassiveProlinkNetwork provides a passive monitoring interface to the
 * Pro DJ Link network using pcap packet capture.
 *
 * Unlike the active ProlinkNetwork, passive mode:
 * - Does not bind to UDP ports (no conflicts with Rekordbox)
 * - Does not announce a virtual CDJ (devices don't know we exist)
 * - Cannot send packets (no CDJ control, no queryMediaSlot)
 * - Works with USB-connected devices (XDJ-AZ, XDJ-XZ)
 *
 * Requirements:
 * - Root/sudo privileges for packet capture
 * - libpcap (Linux) or Npcap/WinPcap (Windows)
 * - The 'cap' npm module
 */
export class PassiveProlinkNetwork {
  #adapter: PcapAdapter;
  #deviceManager: PassiveDeviceManager;
  #statusEmitter: PassiveStatusEmitter;
  #positionEmitter: PassivePositionEmitter;
  #localdb: PassiveLocalDatabase;
  #remotedb: PassiveRemoteDatabase | null = null;
  #mixstatus: MixstatusProcessor | null = null;

  constructor(config: PassiveNetworkConfig) {
    this.#adapter = new PcapAdapter({
      iface: config.iface,
      bufferSize: config.bufferSize,
    });

    // Only pass defined config values to avoid overwriting defaults with undefined
    this.#deviceManager = new PassiveDeviceManager(
      this.#adapter,
      config.deviceTimeout !== undefined
        ? {deviceTimeout: config.deviceTimeout}
        : undefined
    );

    this.#statusEmitter = new PassiveStatusEmitter(this.#adapter);
    this.#positionEmitter = new PassivePositionEmitter(this.#adapter);
    this.#localdb = new PassiveLocalDatabase(
      this.#deviceManager,
      this.#statusEmitter,
      config.databasePreference ?? 'auto'
    );
  }

  /**
   * Start passive packet capture.
   * Requires root/sudo privileges.
   */
  start() {
    this.#adapter.start();
  }

  /**
   * Stop packet capture and clean up all resources.
   */
  stop() {
    this.#deviceManager.stop();
    this.#statusEmitter.stop();
    this.#positionEmitter.stop();
    this.#localdb.stop();
    this.#remotedb?.stop();
    this.#adapter.stop();
  }

  /**
   * Check if packet capture is active.
   */
  get isCapturing() {
    return this.#adapter.isCapturing;
  }

  /**
   * Get the network interface being monitored.
   */
  get interfaceName() {
    return this.#adapter.interfaceName;
  }

  /**
   * Get the pcap adapter for advanced usage.
   */
  get adapter() {
    return this.#adapter;
  }

  /**
   * Get the PassiveDeviceManager service. Tracks devices on the network
   * by listening to announcement packets.
   */
  get deviceManager() {
    return this.#deviceManager;
  }

  /**
   * Get the PassiveStatusEmitter service. Reports CDJ status updates
   * received via packet capture.
   */
  get statusEmitter() {
    return this.#statusEmitter;
  }

  /**
   * Get the PassivePositionEmitter service. Reports absolute playhead
   * position updates from CDJ-3000+ devices.
   */
  get positionEmitter() {
    return this.#positionEmitter;
  }

  /**
   * Get the PassiveLocalDatabase service. Provides access to rekordbox
   * databases on devices using NFS (works without announcing a VCDJ).
   */
  get localdb() {
    return this.#localdb;
  }

  /**
   * Get (and initialize) the PassiveRemoteDatabase service. Provides access
   * to track metadata via RemoteDB queries.
   *
   * Note: This sends TCP packets to devices, so it's not fully "passive",
   * but it avoids UDP announcements that would conflict with Rekordbox.
   *
   * Useful for getting metadata for Rekordbox Link tracks where NFS
   * access is not available.
   */
  get remotedb() {
    if (this.#remotedb === null) {
      this.#remotedb = new PassiveRemoteDatabase(this.#deviceManager);
    }
    return this.#remotedb;
  }

  /**
   * Get (and initialize) the MixstatusProcessor service. Can be used to
   * monitor the 'status' of devices on the network as a whole.
   */
  get mixstatus() {
    if (this.#mixstatus === null) {
      this.#mixstatus = new MixstatusProcessor();
      this.#statusEmitter.on('status', s => this.#mixstatus?.handleState(s));
    }
    return this.#mixstatus;
  }
}

/**
 * Create and start a passive Pro DJ Link network monitor.
 *
 * This is the primary entrypoint for passive mode. It captures Pro DJ Link
 * packets via pcap without binding to UDP ports or announcing a virtual CDJ.
 *
 * @example
 * ```typescript
 * import { bringOnlinePassive } from 'alphatheta-connect';
 *
 * // Start passive monitoring on en15 (XDJ-XZ USB interface)
 * const network = await bringOnlinePassive({ iface: 'en15' });
 *
 * // Listen for devices
 * network.deviceManager.on('connected', device => {
 *   console.log('Device connected:', device.name);
 * });
 *
 * // Listen for track changes
 * network.statusEmitter.on('status', status => {
 *   console.log('Track:', status.trackId);
 * });
 *
 * // Get track metadata via NFS
 * const track = await network.localdb.get(device.id, MediaSlot.USB);
 *
 * // Cleanup
 * network.stop();
 * ```
 *
 * @param config - Configuration including network interface name
 * @returns PassiveProlinkNetwork instance
 */
export function bringOnlinePassive(config: PassiveNetworkConfig): PassiveProlinkNetwork {
  const network = new PassiveProlinkNetwork(config);
  network.start();
  return network;
}

/**
 * List available network interfaces that can be used for packet capture.
 * Useful for finding USB-connected DJ hardware interfaces.
 *
 * @example
 * ```typescript
 * import { listInterfaces } from 'alphatheta-connect/passive';
 *
 * const interfaces = listInterfaces();
 * console.log(interfaces);
 * // [{ name: 'en0', address: '192.168.1.100' }, { name: 'en15', address: '169.254.x.x' }]
 * ```
 */
export function listInterfaces(): Array<{
  name: string;
  address: string;
  description?: string;
}> {
  const interfaces = networkInterfaces();
  const result: Array<{name: string; address: string; description?: string}> = [];

  for (const [name, infos] of Object.entries(interfaces)) {
    if (!infos) {
      continue;
    }

    for (const info of infos as NetworkInterfaceInfo[]) {
      // Only include IPv4, non-internal interfaces
      if (info.family === 'IPv4' && !info.internal) {
        result.push({
          name,
          address: info.address,
          // USB-connected DJ hardware typically uses link-local addresses
          description: info.address.startsWith('169.254.')
            ? 'Link-local (USB device?)'
            : undefined,
        });
      }
    }
  }

  return result;
}
