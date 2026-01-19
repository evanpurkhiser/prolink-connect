import StrictEventEmitter from 'strict-event-emitter-types';

import {EventEmitter} from 'events';

import {mediaSlotFromPacket, onAirFromPacket, statusFromPacket} from 'src/status/utils';
import {CDJStatus, MediaSlotInfo} from 'src/types';

import {PacketInfo, PcapAdapter} from './pcap-adapter';

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

/**
 * PassiveStatusEmitter reports CDJ status updates received via passive
 * packet capture instead of UDP sockets.
 *
 * It provides the same event API as the active StatusEmitter, but does
 * NOT support the queryMediaSlot method since that requires sending packets.
 *
 * In passive mode, media slot information is received when CDJs broadcast
 * it naturally (e.g., when media is inserted or at startup).
 */
export class PassiveStatusEmitter {
  #emitter: Emitter = new EventEmitter();
  #adapter: PcapAdapter;

  constructor(adapter: PcapAdapter) {
    this.#adapter = adapter;
    adapter.on('status', this.#handleStatus as any);
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Stop listening to the pcap adapter.
   */
  stop() {
    this.#adapter.off('status', this.#handleStatus as any);
  }

  #handleStatus = (message: Buffer, _info: PacketInfo) => {
    try {
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
    } catch {
      // Ignore malformed packets
    }

    return undefined;
  };
}

export default PassiveStatusEmitter;
