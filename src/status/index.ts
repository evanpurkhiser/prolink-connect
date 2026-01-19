import {Mutex} from 'async-mutex';
import StrictEventEmitter from 'strict-event-emitter-types';

import {Socket} from 'dgram';
import {EventEmitter} from 'events';

import {STATUS_PORT} from 'src/constants';
import {CDJStatus, MediaSlotInfo} from 'src/types';
import {udpSend} from 'src/utils/udp';

import {makeMediaSlotRequest} from './media';
import {mediaSlotFromPacket, onAirFromPacket, statusFromPacket} from './utils';

interface StatusEvents {
  /**
   * Fired each time the CDJ reports its status
   */
  status: (status: CDJStatus.State) => void;
  /**
   * Fired when the CDJ reports its media slot status
   */
  mediaSlot: (info: MediaSlotInfo) => void;
  /**
   * Fired when the mixer broadcasts on-air channel status
   */
  onAir: (status: CDJStatus.OnAirStatus) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, StatusEvents>;

type MediaSlotOptions = Parameters<typeof makeMediaSlotRequest>[0];

/**
 * The status emitter will report every time a device status is received
 */
class StatusEmitter {
  #statusSocket: Socket;
  /**
   * The EventEmitter which reports the device status
   */
  #emitter: Emitter = new EventEmitter();
  /**
   * Lock used to avoid media slot query races
   */
  #mediaSlotQueryLock = new Mutex();

  /**
   * @param statusSocket A UDP socket to receive CDJ status packets on
   */
  constructor(statusSocket: Socket) {
    this.#statusSocket = statusSocket;
    statusSocket.on('message', this.#handleStatus);
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  #handleStatus = (message: Buffer) => {
    const status = statusFromPacket(message);

    if (status !== undefined) {
      return this.#emitter.emit('status', status);
    }

    // Media slot status is also reported on this socket
    const mediaSlot = mediaSlotFromPacket(message);

    if (mediaSlot !== undefined) {
      return this.#emitter.emit('mediaSlot', mediaSlot);
    }

    // On-air status from mixer is also reported on this socket
    const onAir = onAirFromPacket(message);

    if (onAir !== undefined) {
      return this.#emitter.emit('onAir', onAir);
    }

    return undefined;
  };

  /**
   * Retrieve media slot status information.
   */
  async queryMediaSlot(options: MediaSlotOptions) {
    const request = makeMediaSlotRequest(options);

    const media = await this.#mediaSlotQueryLock.runExclusive(async () => {
      await udpSend(this.#statusSocket, request, STATUS_PORT, options.device.ip.address);

      return new Promise<MediaSlotInfo>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.off('mediaSlot', handler);
          reject(
            new Error(
              `Timeout waiting for media slot response from device ${options.device.id}`
            )
          );
        }, 10000);

        const handler = (info: MediaSlotInfo) => {
          // Only resolve if this is for our device and slot
          if (info.deviceId === options.device.id && info.slot === options.slot) {
            clearTimeout(timeout);
            resolve(info);
          } else {
            // Re-register for the next event
            this.once('mediaSlot', handler);
          }
        };

        this.once('mediaSlot', handler);
      });
    });

    return media;
  }
}

export default StatusEmitter;
