/**
 * Replay helpers for the NFS test fixtures.
 *
 * Loads an NDJSON wire-trace produced by `scripts/capture-nfs.ts` and exposes
 * a `FakeRpcSocket` that satisfies the (small) subset of `dgram.Socket` the
 * library actually touches. Inject it into `RpcConnection` and the lib drives
 * itself through the recorded transaction sequence.
 */
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export interface WireRecord {
  phase: string;
  port: number;
  sent: string;
  received?: string;
  error?: string;
}

export function loadWireTrace(name: string): WireRecord[] {
  const path = join(import.meta.dirname, '..', '_fixtures', name);
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as WireRecord);
}

/**
 * A `dgram.Socket` look-alike that replays the responses captured in a
 * `WireRecord[]`. On each `send`, it pops the next record and (if it has a
 * `received` payload) emits a `message` event on the next tick so the lib's
 * `udpRead` resolves with the recorded reply. Records with `error` produce
 * silence — the lib's transaction timeout will fire naturally, which lets us
 * exercise the portmap-fallback path the same way the live test does.
 */
export class FakeRpcSocket extends EventEmitter {
  #records: WireRecord[];
  #cursor = 0;
  /** Each send (in order) gets recorded so tests can assert on outgoing bytes. */
  readonly sends: Array<{port: number; bytes: Buffer}> = [];

  constructor(records: WireRecord[]) {
    super();
    this.#records = records;
  }

  get cursor() {
    return this.#cursor;
  }

  send(
    msg: Buffer | Uint8Array,
    offset: number,
    length: number,
    port: number,
    _address: string,
    cb?: (err: Error | null, bytes: number) => void,
  ): void {
    const sent = Buffer.from(msg.subarray(offset, offset + length));
    this.sends.push({port, bytes: sent});

    if (this.#cursor >= this.#records.length) {
      cb?.(new Error(`FakeRpcSocket exhausted after ${this.#cursor} records`), 0);
      return;
    }

    const record = this.#records[this.#cursor++];
    cb?.(null, length);

    if (record.received !== undefined) {
      // setImmediate so the lib's `once('message')` handler is registered
      // before we fire — `udpRead` is called *after* `udpSend` resolves.
      setImmediate(() => this.emit('message', Buffer.from(record.received!, 'base64')));
    }
    // If `received` is undefined (the record represents a timeout/error case)
    // we deliberately stay silent and let the call's transactionTimeout fire.
  }

  close(): void {
    setImmediate(() => this.emit('close'));
  }

  address() {
    return {address: '0.0.0.0', port: 0, family: 'IPv4'};
  }
}
