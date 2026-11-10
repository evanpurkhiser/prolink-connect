import {readMock} from 'tests/utils';

import type {Socket} from 'node:dgram';
import {EventEmitter} from 'node:events';

import {PROLINK_HEADER} from 'src/constants';
import StatusEmitter from 'src/status';

function makeEmitter() {
  const socket = new EventEmitter();
  const emitter = new StatusEmitter(socket as unknown as Socket);

  return {socket, emitter};
}

describe('StatusEmitter', () => {
  it('ignores a datagram on the status port that is not a Pro DJ Link packet', () => {
    const {socket, emitter} = makeEmitter();
    const onStatus = vi.fn();
    const onMediaSlot = vi.fn();

    emitter.on('status', onStatus);
    emitter.on('mediaSlot', onMediaSlot);

    expect(() => socket.emit('message', Buffer.from('hello'))).not.toThrow();
    expect(onStatus).not.toHaveBeenCalled();
    expect(onMediaSlot).not.toHaveBeenCalled();
  });

  it('ignores a status packet that is too short to hold its packet counter', () => {
    const {socket, emitter} = makeEmitter();
    const onStatus = vi.fn();

    emitter.on('status', onStatus);

    const packet = Buffer.alloc(0xca);
    PROLINK_HEADER.forEach((byte, i) => packet.writeUInt8(byte, i));

    expect(() => socket.emit('message', packet)).not.toThrow();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('still lets an error from a listener through', async () => {
    const {socket, emitter} = makeEmitter();

    emitter.on('mediaSlot', () => {
      throw new Error('listener failed');
    });

    const packet = await readMock('media-slot-usb.dat');

    expect(() => socket.emit('message', packet)).toThrow('listener failed');
  });
});
