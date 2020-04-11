import ip from 'ip-address';
import PromiseSocket from 'promise-socket';
import {Socket} from 'net';
import {Mutex} from 'async-mutex';

import {Device, DeviceID, TrackType, TrackSlot} from 'src/types';
import {REMOTEDB_SERVER_QUERY_PORT} from 'src/remotedb/constants';
import {UInt32, readField} from 'src/remotedb/fields';
import {Message, MessageType, Item, ItemType} from 'src/remotedb/message';
import {fieldFromDescriptor, renderItems, MenuTarget} from 'src/remotedb/queries';

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

  async readMessage<T extends MessageType>(expect: T) {
    return await Message.fromStream(this.socket, expect);
  }
}

/**
 * Service that maintains remote database connections with devices on the network.
 */
export class RemoteDatabase {
  /**
   * The device we are accessing other remote databases from.
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

  async lookupMetadata(device: Device) {
    const trackDescriptor = {
      hostDeviceId: this.hostDevice.id,
      menuTarget: MenuTarget.Main,
      trackSlot: TrackSlot.RB,
      trackType: TrackType.RB,
    };

    const trackRequest = new Message({
      type: MessageType.GetMetadata,
      args: [fieldFromDescriptor(trackDescriptor), new UInt32(9688)],
    });

    const conn = this.connections[device.id];

    await conn.writeMessage(trackRequest);
    const resp = await conn.readMessage(MessageType.Success);

    const itemsTotal = resp.args[1].value;

    if (typeof itemsTotal !== 'number') {
      return;
    }

    console.log(`reading ${itemsTotal} items`);

    type ItemMap = {
      [P in ItemType]?: Item<P>;
    };

    const data: ItemMap = {};

    const items = renderItems(conn, trackDescriptor, itemsTotal);

    for await (const item of items) {
      data[item.args[6].value as ItemType] = item;
    }

    console.log(data);
  }
}
