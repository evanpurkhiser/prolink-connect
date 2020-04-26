import ip from 'ip-address';
import PromiseSocket from 'promise-socket';
import {Socket} from 'net';
import {Mutex} from 'async-mutex';

import {Device, DeviceID, TrackType, TrackSlot} from 'src/types';

import {REMOTEDB_SERVER_QUERY_PORT} from './constants';
import {UInt32, readField} from './fields';
import {Response, MessageType, DataRequest} from './message/types';
import {Message} from './message';
import {queryHandlers} from './queries';

/**
 * Menu target specifies where a menu should be "rendered" This differes based
 * on the request being made.
 */
export enum MenuTarget {
  Main = 0x01,
}

/**
 * Used to specify where to lookup data when making queries
 */
export type LookupDescriptor = {
  hostDevice: Device;
  menuTarget: MenuTarget;
  trackSlot: TrackSlot;
  trackType: TrackType;
};

// TODO: This should be expanded to extend Requset once we have all the rest in
// the queryHandlers
type QueryArgs<T extends DataRequest> = Parameters<typeof queryHandlers[T]>[0]['args'];

type QueryOpts<T extends DataRequest> = {
  lookupDescriptor: LookupDescriptor;
  /**
   * The device to target the query to
   */
  device: Device;
  /**
   * The query type to make
   */
  query: T;
  /**
   * Arguments to pass to the query. These are query speciifc
   */
  args: QueryArgs<T>;
};

/**
 * Queries the remote device for the port that the remote database server is
 * listening on for requests.
 */
export async function getRemoteDBServerPort(deviceIp: ip.Address4) {
  const conn = new PromiseSocket(new Socket());
  await conn.connect(REMOTEDB_SERVER_QUERY_PORT, deviceIp.address);

  // Magic request packet asking the device to report it's remoteDB port
  const data = Buffer.from([
    ...[0x00, 0x00, 0x00, 0x0f],
    ...Buffer.from('RemoteDBServer', 'ascii'),
    0x00,
  ]);

  await conn.write(data);
  const resp = await conn.read();

  if (typeof resp !== 'object') {
    throw new Error('Invalid response from remotedb');
  }

  if (resp.length !== 2) {
    throw new Error(`Expected 2 bytes, got ${resp.length}`);
  }

  return resp.readUInt16BE();
}

/**
 * Manages a connection to a single device
 */
export class Connection {
  socket: PromiseSocket<Socket>;
  txId: number;
  lock: Mutex;

  constructor(socket: PromiseSocket<Socket>) {
    this.socket = socket;
    this.txId = 0;
    this.lock = new Mutex();
  }

  async writeMessage(message: Message) {
    message.transactionId = ++this.txId;
    await this.socket.write(message.buffer);
  }

  readMessage<T extends Response>(expect: T) {
    return this.lock.runExclusive(() => Message.fromStream(this.socket, expect));
  }
}

/**
 * Service that maintains remote database connections with devices on the network.
 */
export class RemoteDatabase {
  /**
   * Our host device that is talking to the remotedb server.
   */
  hostDevice: Device;

  /**
   * Active device connection map
   */
  connections: Record<DeviceID, Connection> = {};

  constructor(hostDevice: Device) {
    this.hostDevice = hostDevice;
  }

  async connectToDevice(device: Device) {
    const {ip} = device;

    const dbPort = await getRemoteDBServerPort(ip);

    const socket = new PromiseSocket(new Socket());
    await socket.connect(dbPort, ip.address);

    // Send required preamble to open communications with the device
    const preamble = new UInt32(0x01);
    await socket.write(preamble.buffer);

    // Read the response. It should be a UInt32 field with the value 0x01.
    // There is some kind of problem if not.
    const data = await readField(socket, UInt32.type);

    if (data.value !== 0x01) {
      throw new Error(`Expected 0x01 during preamble handshake. Got ${data.value}`);
    }

    // Send introduction message to set context for querying
    const intro = new Message({
      transactionId: 0xfffffffe,
      type: MessageType.Introduce,
      args: [new UInt32(this.hostDevice.id)],
    });

    await socket.write(intro.buffer);
    const resp = await Message.fromStream(socket, MessageType.Success);

    if (resp.type !== MessageType.Success) {
      throw new Error(`Failed to introduce self to device ID: ${device.id}`);
    }

    this.connections[device.id] = new Connection(socket);
  }

  query<T extends DataRequest>(opts: QueryOpts<T>) {
    const {query, lookupDescriptor, device, args} = opts;
    const conn = this.connections[device.id];

    const handler = queryHandlers[query];

    return handler({conn, lookupDescriptor, args});
  }
}
