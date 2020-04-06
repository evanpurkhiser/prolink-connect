import ip from 'ip-address';
import PromiseSocket from 'promise-socket';
import {Socket} from 'net';
import {Mutex} from 'async-mutex';

import {UInt32, readField} from 'src/fields';
import {Device, DeviceID, TrackType, TrackSlot} from 'src/types';
import Message, {MessageType, makeDescriptorField, MenuTarget} from 'src/message';

/**
 * The consistent port on which we can query the remote db server for the port
 */
const RB_DB_SERVER_QUERY_PORT = 12523;

/**
 * Queries the remote device for the port that the remote database server is
 * listening on for requests.
 */
export async function getRemoteDBServerPort(deviceIp: ip.Address4) {
  const conn = new PromiseSocket(new Socket());
  await conn.connect(RB_DB_SERVER_QUERY_PORT, deviceIp.address);

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

type Connection = {
  conn: PromiseSocket<Socket>;
  txId: number;
  lock: Mutex;
};

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

    const conn = new PromiseSocket(new Socket());
    await conn.connect(dbPort, ip.address);

    // Send required preamble to open communications with the device
    const preamble = new UInt32(0x01);
    await conn.write(preamble.buffer);

    // Read the response. It should be a UInt32 field with the value 0x01.
    // There is some kind of problem if not.
    const data = await readField(conn, UInt32.type);

    if (data.value !== 0x01) {
      throw new Error(`Expected 0x01 during preamble handshake. Got ${data.value}`);
    }

    // Send introduction message to set context for querying
    const intro = new Message({
      transactionId: 0xfffffffe,
      type: MessageType.Introduce,
      args: [new UInt32(this.hostDevice.id)],
    });

    await conn.write(intro.buffer);
    const resp = await Message.fromStream(conn);

    if (resp.type !== MessageType.Success) {
      throw new Error(`Failed to introduce self to device ID: ${device.id}`);
    }

    this.connections[device.id] = {
      conn,
      txId: 0,
      lock: new Mutex(),
    };
  }

  async sendMessage(deviceId: DeviceID, message: Message) {
    const {lock, conn} = this.connections[deviceId];

    const releaseLock = await lock.acquire();
    message.transactionId = ++this.connections[deviceId].txId;

    try {
      await conn.write(message.buffer);
      return await Message.fromStream(conn);
    } finally {
      releaseLock();
    }
  }

  async lookupMetadata(device: Device) {
    const trackDescriptorField = makeDescriptorField({
      hostDeviceId: this.hostDevice.id,
      menuTarget: MenuTarget.Main,
      trackSlot: TrackSlot.RB,
      trackType: TrackType.RB,
    });

    const trackRequest = new Message({
      type: MessageType.GetMetadata,
      args: [trackDescriptorField, new UInt32(9688)],
    });

    const resp = await this.sendMessage(device.id, trackRequest);
    const items = resp.args[1].value;

    const renderRequest = new Message({
      type: MessageType.RenderMenu,
      args: [
        trackDescriptorField,
        new UInt32(0),
        new UInt32(64),
        new UInt32(0),
        new UInt32(64),
        new UInt32(0),
      ],
    });

    console.log(items);
  }
}
