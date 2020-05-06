import {SocketAsPromised} from 'dgram-as-promised';
import {EventEmitter} from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';

import {STATUS_PORT} from 'src/constants';
import {CDJStatus, MediaSlotInfo} from 'src/types';

import {statusFromPacket, mediaSlotFromPacket} from './utils';
import {makeMediaSlotRequest} from './media';

type StatusEvents = {
  /**
   * Fired each time the CDJ reports its status
   */
  status: (status: CDJStatus.State) => void;
  /**
   * Fired when the CDJ reports its media slot status
   */
  mediaSlot: (info: MediaSlotInfo) => void;
};

type MediaSlotOptions = Parameters<typeof makeMediaSlotRequest>[0];

/**
 * The status emitter will report every time a device status is recieved
 */
class StatusEmitter {
  #statusSocket: SocketAsPromised;
  /**
   * The EventEmitter which
   */
  #emitter: StrictEventEmitter<EventEmitter, StatusEvents> = new EventEmitter();

  /**
   * @param statusSocket A UDP socket to recieve CDJ status packets on
   */
  constructor(statusSocket: SocketAsPromised) {
    this.#statusSocket = statusSocket;
    statusSocket.socket.on('message', this.#handleStatus);
  }

  // Bind public event emitter interface

  on = this.#emitter.addListener.bind(this.#emitter);
  off = this.#emitter.removeListener.bind(this.#emitter);
  once = this.#emitter.once.bind(this.#emitter);

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
  };

  /**
   * Retrieve media slot status information.
   */
  async queryMediaSlot(options: MediaSlotOptions) {
    const request = makeMediaSlotRequest(options);

    await this.#statusSocket.send(request, STATUS_PORT, options.device.ip.address);
    return await new Promise<MediaSlotInfo>(resolve => this.once('mediaSlot', resolve));
  }
}

export default StatusEmitter;
