import ip from 'ip-address';
import PromiseSocket from 'promise-socket';
import {Socket} from 'net';
import {Mutex} from 'async-mutex';

import {Device, DeviceID, TrackType, TrackSlot} from 'src/types';
import {REMOTEDB_SERVER_QUERY_PORT} from 'src/remotedb/constants';
import {UInt32, readField, Binary} from 'src/remotedb/fields';
import {fieldFromDescriptor, renderItems, MenuTarget} from 'src/remotedb/queries';
import {Message} from 'src/remotedb/message';
import {Response, MessageType} from 'src/remotedb/message/types';
import {ItemType, Item, Items} from 'src/remotedb/message/item';

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

  async readMessage<T extends Response>(expect: T) {
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

    console.log(data);

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

    console.log('here we go');

    await conn.writeMessage(trackRequest);
    const resp = await conn.readMessage(MessageType.Success);
    const items = renderItems(conn, trackDescriptor, resp.data.itemsAvailable);

    const data: Partial<Items> = {};
    for await (const item of items) {
      data[item.type] = item as any;
    }

    console.log(data);

    const artId = data[ItemType.TrackTitle]?.artworkId ?? 0;

    const artRequest = new Message({
      type: MessageType.GetArtwork,
      args: [fieldFromDescriptor(trackDescriptor), new UInt32(artId)],
    });

    await conn.writeMessage(artRequest);
    const art = await conn.readMessage(MessageType.Artwork);

    const beatGrid = new Message({
      type: MessageType.GetBeatGrid,
      args: [fieldFromDescriptor(trackDescriptor), new UInt32(9688)],
    });

    await conn.writeMessage(beatGrid);
    const grid = await conn.readMessage(MessageType.BeatGrid);

    console.log('got grid', grid.data.slice(0, 20));

    const waveformPreview = new Message({
      type: MessageType.GetWaveformPreview,
      args: [
        fieldFromDescriptor(trackDescriptor),
        new UInt32(0),
        new UInt32(6616),
        new UInt32(0),
        new Binary(Buffer.alloc(0)),
      ],
    });

    await conn.writeMessage(waveformPreview);
    const previewWave = await conn.readMessage(MessageType.WaveformPreview);

    console.log('got waveform ');

    const waveformDetailed = new Message({
      type: MessageType.GetWaveformDetailed,
      args: [fieldFromDescriptor(trackDescriptor), new UInt32(6616), new UInt32(0)],
    });

    await conn.writeMessage(waveformDetailed);
    const pv = await conn.readMessage(MessageType.WaveformDetailed);

    console.log('got detailed waveform');

    const waveformHd = new Message({
      type: MessageType.GetWaveformHD,
      args: [
        fieldFromDescriptor(trackDescriptor),
        new UInt32(10010),
        new UInt32(Buffer.from('PWV5').readUInt32LE()),
        new UInt32(Buffer.from('EXT\0').readUInt32LE()),
      ],
    });

    await conn.writeMessage(waveformHd);
    const hd = await conn.readMessage(MessageType.WaveformHD);

    const cueLoops = new Message({
      type: MessageType.GetCueAndLoops,
      args: [fieldFromDescriptor(trackDescriptor), new UInt32(10010)],
    });

    await conn.writeMessage(cueLoops);
    const cl = await conn.readMessage(MessageType.CueAndLoop);

    console.log(cl.data);

    const advCueLoops = new Message({
      type: MessageType.GetAdvCueAndLoops,
      args: [fieldFromDescriptor(trackDescriptor), new UInt32(9688), new UInt32(0)],
    });

    await conn.writeMessage(advCueLoops);
    const acl = await conn.readMessage(MessageType.AdvCueAndLoops);

    console.log(acl.data);

    // const waveformData = hd.data;

    //     const canvas = createCanvas(waveformData.length / 3, 128);
    //     const ctx = canvas.getContext('2d');

    //     waveformData.slice(0, waveformData.length / 3).forEach((d, i) => {
    //       const blue = Color.rgb(d.color.map(c => c * 255));

    //       ctx.strokeStyle = blue.hex();
    //       ctx.beginPath();
    //       ctx.lineTo(i + 0.5, 64 - d.height * 2);
    //       ctx.lineTo(i + 0.5, 64 + d.height * 2);
    //       ctx.stroke();
    //     });

    // const {path} = await tmp.file();

    // appendFile(path, canvas.toBuffer('image/png'), () => {
    //   open(`file://${path}`, {app: 'google chrome'});
    // });
  }
}
