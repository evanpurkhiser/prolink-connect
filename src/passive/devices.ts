import * as ip from 'ip-address';
import StrictEventEmitter from 'strict-event-emitter-types';

import {EventEmitter} from 'events';

import {PROLINK_HEADER} from 'src/constants';
import {Device, DeviceID, DeviceType} from 'src/types';

import {PacketInfo, PcapAdapter} from './pcap-adapter';

/**
 * Parse a device from an announce packet, using the source IP from PacketInfo
 * when the packet payload doesn't contain the full IP address.
 *
 * This handles both standard and short-format announce packets (46 bytes)
 * that some devices like XDJ-XZ send.
 */
function deviceFromPacketWithInfo(packet: Buffer, info: PacketInfo): Device | null {
  // Check for Pro DJ Link header
  if (packet.indexOf(PROLINK_HEADER) !== 0) {
    return null;
  }

  // Check for stage 3 announce (type 0x06 at offset 0x0a)
  if (packet[0x0a] !== 0x06) {
    return null;
  }

  // Extract device name (20 bytes starting at offset 0x0c)
  const name = packet
    .slice(0x0c, 0x0c + 20)
    .toString()
    .replace(/\0/g, '');

  // Short-format packets (46 bytes) have different offsets
  const isShortFormat = packet.length < 0x35;

  let deviceId: number;
  let deviceType: DeviceType;
  let macAddr: Uint8Array;
  let deviceIp: ip.Address4;

  if (isShortFormat) {
    // Short format (46 bytes) - XDJ-XZ, etc.
    // Device ID at 0x24
    deviceId = packet[0x24];

    // Short-format packets don't have device type at the usual offset.
    // Use device ID heuristic: 1-6 are CDJ slots, 17 is Rekordbox, 33+ are mixer
    if (deviceId >= 1 && deviceId <= 6) {
      deviceType = DeviceType.CDJ;
    } else if (deviceId === 17) {
      deviceType = DeviceType.Rekordbox;
    } else {
      deviceType = DeviceType.Mixer;
    }

    // MAC address at 0x26 (6 bytes)
    macAddr = new Uint8Array(packet.slice(0x26, Math.min(0x2c, packet.length)));

    // Use source IP from packet info (payload may be truncated)
    deviceIp = new ip.Address4(info.srcAddr);
  } else {
    // Standard format
    deviceId = packet[0x24];
    deviceType = packet[0x34];
    macAddr = new Uint8Array(packet.slice(0x26, 0x26 + 6));
    deviceIp = ip.Address4.fromInteger(packet.readUInt32BE(0x2c));
  }

  return {
    name,
    id: deviceId,
    type: deviceType,
    macAddr,
    ip: deviceIp,
  };
}

interface Config {
  /**
   * Time in milliseconds after which a device is considered to have
   * disconnected if it has not broadcast an announcement.
   *
   * @default 10000 ms
   */
  deviceTimeout?: number;
}

const defaultConfig: Required<Config> = {
  deviceTimeout: 10000,
};

/**
 * The upper bound in milliseconds to wait when looking for a device to be on
 * the network when using the `getDeviceEnsured` method.
 */
const ENSURED_TIMEOUT = 2000;

/**
 * The interface the passive device manager event emitter should follow
 */
interface DeviceEvents {
  /**
   * Fired when a new device becomes available on the network
   */
  connected: (device: Device) => void;
  /**
   * Fired when a device has not announced itself on the network for the
   * specified timeout.
   */
  disconnected: (device: Device) => void;
  /**
   * Fired every time the device announces itself on the network
   */
  announced: (device: Device) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, DeviceEvents>;

/**
 * PassiveDeviceManager tracks devices on the Pro DJ Link network using
 * passive packet capture instead of UDP sockets.
 *
 * It provides the same API as the active DeviceManager, making it easy
 * to swap between active and passive modes.
 */
export class PassiveDeviceManager {
  #config: Required<Config>;
  /**
   * The map of all active devices currently available on the network.
   */
  #devices = new Map<DeviceID, Device>();
  /**
   * Tracks device timeout handlers, as devices announce themselves these
   * timeouts will be updated.
   */
  #deviceTimeouts = new Map<DeviceID, NodeJS.Timeout>();
  /**
   * The EventEmitter which will be used to trigger device lifecycle events
   */
  #emitter: Emitter = new EventEmitter();
  /**
   * Reference to the pcap adapter for cleanup
   */
  #adapter: PcapAdapter;

  constructor(adapter: PcapAdapter, config?: Config) {
    this.#config = {...defaultConfig, ...config};
    this.#adapter = adapter;

    // Listen for announce packets from the pcap adapter
    adapter.on('announce', this.#handleAnnounce as any);
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Get active devices on the network.
   */
  get devices() {
    return this.#devices;
  }

  /**
   * Waits for a specific device ID to appear on the network, with a
   * configurable timeout, in which case it will resolve with null.
   */
  async getDeviceEnsured(id: DeviceID, timeout: number = ENSURED_TIMEOUT) {
    const existingDevice = this.devices.get(id);

    if (existingDevice !== undefined) {
      return existingDevice;
    }

    let handler: ((device: Device) => void) | undefined;

    // Wait for the device to be connected
    const devicePromise = new Promise<Device>(resolve => {
      handler = (device: Device) => device.id === id && resolve(device);
      this.on('connected', handler);
    });

    const device = await Promise.race([
      devicePromise,
      new Promise<null>(r => setTimeout(() => r(null), timeout)),
    ]);
    this.off('connected', handler!);

    return device;
  }

  /**
   * Reconfigure the device manager.
   */
  reconfigure(config: Config) {
    this.#config = {...this.#config, ...config};
  }

  /**
   * Stop listening to the pcap adapter and clean up timeouts.
   */
  stop() {
    this.#adapter.off('announce', this.#handleAnnounce as any);

    // Clear all timeouts
    for (const timeout of this.#deviceTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.#deviceTimeouts.clear();
  }

  #handleAnnounce = (message: Buffer, info: PacketInfo) => {
    let device;
    try {
      device = deviceFromPacketWithInfo(message, info);
    } catch {
      // Ignore malformed packets
      return;
    }

    if (device === null) {
      return;
    }

    // Device has not checked in before
    if (!this.#devices.has(device.id)) {
      this.#devices.set(device.id, device);
      this.#emitter.emit('connected', device);
    }

    this.#emitter.emit('announced', device);

    // Reset the device timeout handler
    const activeTimeout = this.#deviceTimeouts.get(device.id);
    if (activeTimeout) {
      clearTimeout(activeTimeout);
    }

    const timeout = this.#config.deviceTimeout;
    const newTimeout = setTimeout(this.#handleDisconnect, timeout, device);
    this.#deviceTimeouts.set(device.id, newTimeout);
  };

  #handleDisconnect = (removedDevice: Device) => {
    this.#devices.delete(removedDevice.id);
    this.#deviceTimeouts.delete(removedDevice.id);

    this.#emitter.emit('disconnected', removedDevice);
  };
}

export default PassiveDeviceManager;
