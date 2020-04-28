import {SocketAsPromised} from 'dgram-as-promised';
import {EventEmitter} from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';

import {CDJStatus} from 'src/types';

import {statusFromPacket} from './utils';

type StatusEvents = {
  /**
   * Fired each time the CDJ reports its status
   */
  status: (status: CDJStatus.State) => void;
};

/**
 * The status emitter will report every time a device status is recieved
 */
class StatusEmitter {
  /**
   * The EventEmitter which
   */
  #emitter: StrictEventEmitter<EventEmitter, StatusEvents> = new EventEmitter();

  /**
   * @param statusSocket A UDP socket to recieve CDJ status packets on
   */
  constructor(statusSocket: SocketAsPromised) {
    statusSocket.socket.on('message', this.#handleStatus);
  }

  // Bind public event emitter interface

  on = this.#emitter.addListener.bind(this.#emitter);
  off = this.#emitter.removeListener.bind(this.#emitter);
  once = this.#emitter.once.bind(this.#emitter);

  #handleStatus = (message: Buffer) => {
    const status = statusFromPacket(message);

    if (status === undefined) {
      return;
    }

    this.#emitter.emit('status', status);
  };
}

export default StatusEmitter;
