import StrictEventEmitter from 'strict-event-emitter-types';

import {EventEmitter} from 'events';

import {positionFromPacket} from 'src/status/utils';
import {CDJStatus} from 'src/types';

import {PacketInfo, PcapAdapter} from './pcap-adapter';

interface PositionEvents {
  /**
   * Fired when an absolute position packet is received from a CDJ-3000+.
   * These packets are sent approximately every 30ms while a track is loaded.
   */
  position: (position: CDJStatus.PositionState) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, PositionEvents>;

/**
 * PassivePositionEmitter reports absolute playhead position updates from
 * CDJ-3000+ devices using passive packet capture.
 *
 * Position packets provide precise track position independent of beat grids,
 * enabling accurate timecode, lighting cue, and video synchronization even
 * during scratching, reverse play, loops, and needle jumps.
 */
export class PassivePositionEmitter {
  #emitter: Emitter = new EventEmitter();
  #adapter: PcapAdapter;

  constructor(adapter: PcapAdapter) {
    this.#adapter = adapter;
    adapter.on('beat', this.#handlePosition as any);
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Stop listening to the pcap adapter.
   */
  stop() {
    this.#adapter.off('beat', this.#handlePosition as any);
  }

  #handlePosition = (message: Buffer, _info: PacketInfo) => {
    const position = positionFromPacket(message);

    if (position !== undefined) {
      this.#emitter.emit('position', position);
    }
  };
}

export default PassivePositionEmitter;
