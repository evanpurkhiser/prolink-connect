import StrictEventEmitter from 'strict-event-emitter-types';

import {Socket} from 'dgram';
import {EventEmitter} from 'events';

import {VIRTUAL_CDJ_NAME} from 'src/constants';
import {Device, DeviceID} from 'src/types';

import {deviceFromPacket} from './utils';

interface Config {
  /**
   * Time in milliseconds after which a device is considered to have
   * disconnected if it has not broadcast an announcement.
   *
   * @default 10000 ms
   */
  deviceTimeout?: number;
}

const defaultConfig = {
  deviceTimeout: 10000,
};

/**
 * The upper bound in milliseconds to wait when looking for a device to be on
 * the network when using the `getDeviceEnsured` method.
 */
const ENSURED_TIMEOUT = 2000;

/**
 * The configuration object that may be passed to reconfigure the manager
 */
type ConfigEditable = Omit<Config, 'announceSocket'>;

/**
 * The interface the device manager event emitter should follow
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
 * The device manager is responsible for tracking devices that appear on the
 * prolink network, providing an API to react to devices livecycle events as
 * they connect and disconnect form the network.
 */
class DeviceManager {
  /**
   * Device manager configuration
   */
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

  constructor(announceSocket: Socket, config?: Config) {
    this.#config = {...defaultConfig, ...config};

    // Begin listening for device announcements
    announceSocket.on('message', this.#handleAnnounce);
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

  reconfigure(config: ConfigEditable) {
    this.#config = {...this.#config, ...config};
  }

  #handleAnnounce = (message: Buffer) => {
    const device = deviceFromPacket(message);

    if (device === null) {
      return;
    }

    if (device.name === VIRTUAL_CDJ_NAME) {
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

export default DeviceManager;
