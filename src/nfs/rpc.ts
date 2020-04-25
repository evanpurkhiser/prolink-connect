import {Mutex} from 'async-mutex';
import dgram, {SocketAsPromised} from 'dgram-as-promised';

import {rpc} from 'src/nfs/xdr';

const RPC_VERSION = 2;

/**
 * The RPC auth stamp passed by the CDJs. It's unclear if this is actually
 * important, but I'm keeping the rpc calls as close to CDJ calls as I can.
 */
const CDJ_AUTH_STAMP = 0x967b8703;

const rpcAuthMessage = new rpc.UnixAuth({
  stamp: CDJ_AUTH_STAMP,
  name: '',
  uid: 0,
  gid: 0,
  gids: [],
});

/**
 * This module implements just enough of the RPC 2 protocol to support making
 * NFS procedure calls to device.
 */

type RpcCall = {
  port: number;
  program: number;
  version: number;
  procedure: number;
  data: Buffer;
};

export default class RpcClient {
  address: string;
  conn: SocketAsPromised;
  mutex: Mutex;
  xid = 1;

  constructor(address: string) {
    this.address = address;
    this.conn = dgram.createSocket('udp4');
    this.mutex = new Mutex();
  }

  async call({port, program, version, procedure, data}: RpcCall) {
    this.xid++;

    // TODO: Mutex?

    const request = new rpc.Request({
      rpcVersion: RPC_VERSION,
      program,
      programVersion: version,
      procedure,
      auth: new rpc.Auth({
        flavor: 1,
        body: rpcAuthMessage.toXDR(),
      }),
      verifier: new rpc.Auth({
        flavor: 0,
        body: Buffer.alloc(0),
      }),
      data,
    });

    const callData = new rpc.Packet({
      xid: this.xid,
      message: rpc.Message.request(request),
    }).toXDR();

    const releaseLock = await this.mutex.acquire();

    try {
      await this.conn.send(callData, 0, callData.length, port, this.address);

      const resp = await new Promise<Buffer>((resolve, reject) =>
        this.conn.socket.once('message', p => {
          const packet = rpc.Packet.fromXDR(p);

          const response = packet.message().response();
          if (response.arm() !== 'accepted') {
            return reject(new Error('RPC request was denied'));
          }

          const data = response.accepted().response();
          if (data.arm() !== 'success') {
            return reject(new Error('RPC did not successfully return data'));
          }

          resolve(data.success());
        })
      );

      return resp;
    } finally {
      releaseLock();
    }
  }

  async disconnect() {
    await this.conn.close();
  }
}
