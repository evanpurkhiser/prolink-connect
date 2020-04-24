import dgram, {SocketAsPromised} from 'dgram-as-promised';
import {hexdump} from '@gct256/hexdump';

import {rpc, portmap, mount} from 'src/nfs/xdr';

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

enum Procedure {
  GET_PORT = 3,
  EXPORT = 5,
}

enum Protocol {
  UDP = 17,
  TCP = 18, // TODO: This is probably wrong
}

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

class RpcClient {
  address: string;
  conn: SocketAsPromised;
  xid = 1;

  constructor(address: string) {
    this.address = address;
    this.conn = dgram.createSocket('udp4');
  }

  async call({port, program, version, procedure, data}: RpcCall) {
    this.xid++;

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

    await this.conn.send(callData, 0, callData.length, port, this.address);

    return await new Promise<Buffer>((resolve, reject) =>
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
  }

  async disconnect() {
    await this.conn.close();
  }
}

async function getNfsPort(client: RpcClient) {
  const getPortData = new portmap.GetPort({
    program: mount.Program,
    version: 1,
    protocol: Protocol.UDP,
    port: 0,
  });

  const data = await client.call({
    port: 111,
    program: portmap.Program,
    version: 2,
    procedure: portmap.Procedure.getPort().value,
    data: getPortData.toXDR(),
  });

  return data.readInt32BE();
}

async function getExports(client: RpcClient, port: number) {
  const data = await client.call({
    port,
    program: mount.Program,
    version: 1,
    procedure: Procedure.EXPORT,
    data: Buffer.alloc(0),
  });

  console.log(data.toString());
}

export async function testRpc() {
  const client = new RpcClient('192.168.86.90');

  const mountPort = await getNfsPort(client);

  getExports(client, mountPort);
}
