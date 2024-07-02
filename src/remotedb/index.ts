import * as Sentry from '@sentry/node';
import {Span} from '@sentry/tracing';
import {Mutex} from 'async-mutex';
import * as ip from 'ip-address';
import PromiseSocket from 'promise-socket';

import {Socket} from 'net';

import DeviceManager from 'src/devices';
import {Device, DeviceID, MediaSlot, TrackType} from 'src/types';

import {getMessageName, MessageType, Request, Response} from './message/types';
import {REMOTEDB_SERVER_QUERY_PORT} from './constants';
import {readField, UInt32} from './fields';
import {Message} from './message';
import {HandlerArgs, HandlerReturn, queryHandlers} from './queries';

type Await<T> = T extends PromiseLike<infer U> ? U : T;

/**
 * Menu target specifies where a menu should be "rendered" This differs based
 * on the request being made.
 */
export enum MenuTarget {
  Main = 0x01,
}

/**
 * Used to specify where to lookup data when making queries
 */
export interface QueryDescriptor {
  menuTarget: MenuTarget;
  trackSlot: MediaSlot;
  trackType: TrackType;
}

/**
 * Used internally when making queries.
 */
export type LookupDescriptor = QueryDescriptor & {
  targetDevice: Device;
  hostDevice: Device;
};

/**
 * Used to specify the query type that is being made
 */
export type Query = keyof typeof queryHandlers;
export const Query = Request;

const QueryInverse = Object.fromEntries(Object.entries(Query).map(e => [e[1], e[0]]));

/**
 * Returns a string representation of a remote query
 */
export function getQueryName(query: Query) {
  return QueryInverse[query];
}

/**
 * Options used to make a remotedb query
 */
interface QueryOpts<T extends Query> {
  queryDescriptor: QueryDescriptor;
  /**
   * The query type to make
   */
  query: T;
  /**
   * Arguments to pass to the query. These are query specific
   */
  args: HandlerArgs<T>;
  /**
   * The sentry span to associate the query with
   */
  span?: Span;
}

/**
 * Queries the remote device for the port that the remote database server is
 * listening on for requests.
 */
async function getRemoteDBServerPort(deviceIp: ip.Address4) {
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
  #socket: PromiseSocket<Socket>;
  #txId = 0;
  #lock = new Mutex();

  device: Device;

  constructor(device: Device, socket: PromiseSocket<Socket>) {
    this.#socket = socket;
    this.device = device;
  }

  async writeMessage(message: Message, span: Span) {
    const tx = span.startChild({
      op: 'writeMessage',
      description: getMessageName(message.type),
    });

    message.transactionId = ++this.#txId;
    await this.#socket.write(message.buffer);
    tx.finish();
  }

  readMessage<T extends Response>(expect: T, span: Span) {
    return this.#lock.runExclusive(() => Message.fromStream(this.#socket, expect, span));
  }

  close() {
    this.#socket.destroy();
  }
}

export class QueryInterface {
  #conn: Connection;
  #hostDevice: Device;
  #lock: Mutex;

  constructor(conn: Connection, lock: Mutex, hostDevice: Device) {
    this.#conn = conn;
    this.#lock = lock;
    this.#hostDevice = hostDevice;
  }

  /**
   * Make a query to the remote database connection.
   */
  async query<T extends Query>(opts: QueryOpts<T>): Promise<Await<HandlerReturn<T>>> {
    const {query, queryDescriptor, args, span} = opts;
    const conn = this.#conn;

    const queryName = getQueryName(opts.query);

    const tx = span
      ? span.startChild({op: 'remoteQuery', description: queryName})
      : Sentry.startTransaction({name: 'remoteQuery', description: queryName});

    const lookupDescriptor: LookupDescriptor = {
      ...queryDescriptor,
      hostDevice: this.#hostDevice,
      targetDevice: this.#conn.device,
    };

    // TODO: Figure out why typescirpt can't understand our query type discriminate
    // for args here. The interface for this actual query function discrimites just
    // fine.
    const anyArgs = args as any;

    const handler = queryHandlers[query];

    const releaseLock = await this.#lock.acquire();
    const response = await handler({conn, lookupDescriptor, span: tx, args: anyArgs});
    releaseLock();
    tx.finish();

    return response as Await<HandlerReturn<T>>;
  }
}

/**
 * Service that maintains remote database connections with devices on the network.
 */
export default class RemoteDatabase {
  #hostDevice: Device;
  #deviceManager: DeviceManager;

  /**
   * Active device connection map
   */
  #connections = new Map<DeviceID, Connection>();
  /**
   * Locks for each device when locating the connection
   */
  #deviceLocks = new Map<DeviceID, Mutex>();

  constructor(deviceManager: DeviceManager, hostDevice: Device) {
    this.#deviceManager = deviceManager;
    this.#hostDevice = hostDevice;
  }

  /**
   * Open a connection to the specified device for querying
   */
  connectToDevice = async (device: Device) => {
    const tx = Sentry.startTransaction({name: 'connectRemotedb', data: {device}});

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
      args: [new UInt32(this.#hostDevice.id)],
    });

    await socket.write(intro.buffer);
    const resp = await Message.fromStream(socket, MessageType.Success, tx);

    if (resp.type !== MessageType.Success) {
      throw new Error(`Failed to introduce self to device ID: ${device.id}`);
    }

    this.#connections.set(device.id, new Connection(device, socket));
    tx.finish();
  };

  /**
   * Disconnect from the specified device
   */
  disconnectFromDevice = async (device: Device) => {
    const tx = Sentry.startTransaction({name: 'disconnectFromDevice', data: {device}});

    const conn = this.#connections.get(device.id);

    if (conn === undefined) {
      return;
    }

    const goodbye = new Message({
      transactionId: 0xfffffffe,
      type: MessageType.Disconnect,
      args: [],
    });

    await conn.writeMessage(goodbye, tx);

    conn.close();
    this.#connections.delete(device.id);
    tx.finish();
  };

  /**
   * Gets the remote database query interface for the given device.
   *
   * If we have not already established a connection with the specified device,
   * we will attempt to first connect.
   *
   * @returns null if the device does not export a remote database service
   */
  async get(deviceId: DeviceID) {
    const device = this.#deviceManager.devices.get(deviceId);
    if (device === undefined) {
      return null;
    }

    const lock =
      this.#deviceLocks.get(device.id) ??
      this.#deviceLocks.set(device.id, new Mutex()).get(device.id)!;

    const releaseLock = await lock.acquire();

    let conn = this.#connections.get(deviceId);
    if (conn === undefined) {
      await this.connectToDevice(device);
    }

    conn = this.#connections.get(deviceId)!;
    releaseLock();

    // NOTE: We pass the same lock we use for this device to the query
    // interface to ensure all query interfaces use the same lock.

    return new QueryInterface(conn, lock, this.#hostDevice);
  }
}
