import dgram, {SocketAsPromised} from 'dgram-as-promised';
import {Mutex} from 'async-mutex';

import {udpRead} from 'src/utils';

import {rpc} from './xdr';

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

type RpcCall = {
  port: number;
  program: number;
  version: number;
  procedure: number;
  data: Buffer;
};

/**
 * Generic RPC connection. Can be used to make RPC 2 calls to any program
 * specified in the RpcCall.
 */
export class RpcConnection {
  address: string;
  socket: SocketAsPromised;
  mutex: Mutex;
  xid = 1;

  constructor(address: string) {
    this.address = address;
    this.socket = dgram.createSocket('udp4');
    this.mutex = new Mutex();
  }

  get connected() {
    // TODO: Figure out what logic we can do here to determine if the socket is
    // still open.
    return true;
  }

  setupRequest({program, version, procedure, data}: Omit<RpcCall, 'port'>) {
    const auth = new rpc.Auth({
      flavor: 1,
      body: rpcAuthMessage.toXDR(),
    });

    const verifier = new rpc.Auth({
      flavor: 0,
      body: Buffer.alloc(0),
    });

    const request = new rpc.Request({
      rpcVersion: rpc.Version,
      programVersion: version,
      program,
      procedure,
      auth,
      verifier,
      data,
    });

    const packet = new rpc.Packet({
      xid: this.xid,
      message: rpc.Message.request(request),
    });

    return packet.toXDR();
  }

  async call({port, ...call}: RpcCall) {
    this.xid++;

    const callData = this.setupRequest(call);
    const releaseLock = await this.mutex.acquire();

    let resp: Buffer;

    try {
      await this.socket.send(callData, 0, callData.length, port, this.address);
      resp = await udpRead(this.socket);
    } finally {
      releaseLock();
    }

    const packet = rpc.Packet.fromXDR(resp);

    const message = packet.message().response();
    if (message.arm() !== 'accepted') {
      throw new Error('RPC request was denied');
    }

    const body = message.accepted().response();
    if (body.arm() !== 'success') {
      throw new Error('RPC did not successfully return data');
    }

    return body.success() as Buffer;
  }

  async disconnect() {
    await this.socket.close();
  }
}

type RpcProgramCall = Pick<RpcCall, 'procedure' | 'data'>;

/**
 * RpcProgram is constructed with specialization details for a specific RPC
 * program. This should be used to avoid having to repeat yourself for calls
 * made using the RpcConnection.
 */
export class RpcProgram {
  program: number;
  version: number;
  port: number;
  conn: RpcConnection;

  constructor(conn: RpcConnection, program: number, version: number, port: number) {
    this.conn = conn;
    this.program = program;
    this.version = version;
    this.port = port;
  }

  call(data: RpcProgramCall) {
    const {program, version, port} = this;
    return this.conn.call({program, version, port, ...data});
  }

  disconnect() {
    this.conn.disconnect();
  }
}
