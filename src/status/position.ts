import StrictEventEmitter from 'strict-event-emitter-types';

import {Socket} from 'dgram';
import {EventEmitter} from 'events';

import {CDJStatus} from 'src/types';

import {positionFromPacket} from './utils';

interface PositionEvents {
  /**
   * Fired when an absolute position packet is received from a CDJ-3000+.
   * These packets are sent approximately every 30ms while a track is loaded.
   */
  position: (position: CDJStatus.PositionState) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, PositionEvents>;

/**
 * The position emitter reports absolute playhead position updates from CDJ-3000+ devices.
 * These packets provide precise track position independent of beat grids, enabling
 * accurate timecode, lighting cue, and video synchronization even during scratching,
 * reverse play, loops, and needle jumps.
 */
class PositionEmitter {
  /**
   * The EventEmitter which reports position updates
   */
  #emitter: Emitter = new EventEmitter();

  /**
   * @param beatSocket A UDP socket to receive position packets on port 50001
   */
  constructor(beatSocket: Socket) {
    beatSocket.on('message', this.#handlePosition);
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  #handlePosition = (message: Buffer) => {
    const position = positionFromPacket(message);

    if (position !== undefined) {
      this.#emitter.emit('position', position);
    }
  };
}

export default PositionEmitter;
