import {Mutex} from 'async-mutex';
import PromiseSocket from 'promise-socket';

import {Socket} from 'net';

import {Connection, MenuTarget, Query, QueryInterface} from 'src/remotedb';
import {REMOTEDB_SERVER_QUERY_PORT} from 'src/remotedb/constants';
import {readField, UInt32} from 'src/remotedb/fields';
import {Message} from 'src/remotedb/message';
import {MessageType} from 'src/remotedb/message/types';
import {Device, DeviceID, MediaSlot, TrackType} from 'src/types';
import * as Telemetry from 'src/utils/telemetry';

import {PassiveDeviceManager} from './devices';

/**
 * Queries the remote device for the port that the remote database server is
 * listening on for requests.
 */
async function getRemoteDBServerPort(deviceIp: string): Promise<number> {
  const conn = new PromiseSocket(new Socket());
  await conn.connect(REMOTEDB_SERVER_QUERY_PORT, deviceIp);

  // Magic request packet asking the device to report its remoteDB port
  const data = Buffer.from([
    ...[0x00, 0x00, 0x00, 0x0f],
    ...Buffer.from('RemoteDBServer', 'ascii'),
    0x00,
  ]);

  await conn.write(data);
  const resp = await conn.read();

  await conn.destroy();

  if (typeof resp !== 'object') {
    throw new Error('Invalid response from remotedb');
  }

  if (resp.length !== 2) {
    throw new Error(`Expected 2 bytes, got ${resp.length}`);
  }

  return resp.readUInt16BE();
}

/**
 * PassiveRemoteDatabase provides RemoteDB query support for passive mode.
 *
 * This allows querying track metadata from Rekordbox Link without fully
 * announcing a virtual CDJ on the network. It uses a "virtual" device ID
 * (default: 5) for the introduction handshake.
 *
 * Note: This makes the mode not fully "passive" since we're sending TCP
 * packets, but we still avoid UDP announcements that would conflict with
 * Rekordbox.
 */
export class PassiveRemoteDatabase {
  #deviceManager: PassiveDeviceManager;
  #virtualDeviceId: number;

  /**
   * Active device connection map
   */
  #connections = new Map<DeviceID, Connection>();
  /**
   * Locks for each device when locating the connection
   */
  #deviceLocks = new Map<DeviceID, Mutex>();

  constructor(deviceManager: PassiveDeviceManager, virtualDeviceId = 5) {
    this.#deviceManager = deviceManager;
    this.#virtualDeviceId = virtualDeviceId;
  }

  /**
   * Open a connection to the specified device for querying
   */
  async connectToDevice(device: Device): Promise<void> {
    const tx = Telemetry.startTransaction({
      name: 'passiveConnectRemotedb',
      data: {device},
    });

    const {ip} = device;
    const dbPort = await getRemoteDBServerPort(ip.address);

    const socket = new PromiseSocket(new Socket());
    await socket.connect(dbPort, ip.address);

    // Send required preamble to open communications with the device
    const preamble = new UInt32(0x01);
    await socket.write(preamble.buffer);

    // Read the response. It should be a UInt32 field with the value 0x01.
    const data = await readField(socket, UInt32.type);

    if (data.value !== 0x01) {
      throw new Error(`Expected 0x01 during preamble handshake. Got ${data.value}`);
    }

    // Send introduction message with our virtual device ID
    const intro = new Message({
      transactionId: 0xfffffffe,
      type: MessageType.Introduce,
      args: [new UInt32(this.#virtualDeviceId)],
    });

    await socket.write(intro.buffer);
    const resp = await Message.fromStream(socket, MessageType.Success, tx);

    if (resp.type !== MessageType.Success) {
      throw new Error(`Failed to introduce self to device ID: ${device.id}`);
    }

    this.#connections.set(device.id, new Connection(device, socket));
    tx.finish();
  }

  /**
   * Disconnect from the specified device
   */
  async disconnectFromDevice(device: Device): Promise<void> {
    const conn = this.#connections.get(device.id);

    if (conn === undefined) {
      return;
    }

    try {
      const tx = Telemetry.startTransaction({
        name: 'passiveDisconnectFromDevice',
        data: {device},
      });

      const goodbye = new Message({
        transactionId: 0xfffffffe,
        type: MessageType.Disconnect,
        args: [],
      });

      await conn.writeMessage(goodbye, tx);
      tx.finish();
    } catch {
      // Ignore errors during disconnect
    }

    conn.close();
    this.#connections.delete(device.id);
  }

  /**
   * Gets the remote database query interface for the given device.
   *
   * If we have not already established a connection with the specified device,
   * we will attempt to first connect.
   *
   * @returns null if the device is not found
   */
  async get(deviceId: DeviceID): Promise<QueryInterface | null> {
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
      try {
        await this.connectToDevice(device);
        conn = this.#connections.get(deviceId);
      } catch (err) {
        releaseLock();
        throw err;
      }
    }

    releaseLock();

    if (conn === undefined) {
      return null;
    }

    // Create a virtual host device for the query interface
    const virtualHostDevice: Device = {
      id: this.#virtualDeviceId,
      name: 'alphatheta-connect',
      type: 0x01, // CDJ type
      macAddr: new Uint8Array([0, 0, 0, 0, 0, 0]),
      ip: device.ip, // Not really used, just needs to be valid
    };

    return new QueryInterface(conn, lock, virtualHostDevice);
  }

  /**
   * Query track metadata from a device.
   *
   * @param deviceId - The device to query (e.g., 17 for Rekordbox)
   * @param trackSlot - The media slot (e.g., MediaSlot.RB for Rekordbox Link)
   * @param trackType - The track type (e.g., TrackType.RB)
   * @param trackId - The track ID to look up
   */
  async getTrackMetadata(
    deviceId: DeviceID,
    trackSlot: MediaSlot,
    trackType: TrackType,
    trackId: number
  ) {
    const conn = await this.get(deviceId);
    if (conn === null) {
      return null;
    }

    const queryDescriptor = {
      trackSlot,
      trackType,
      menuTarget: MenuTarget.Main,
    };

    try {
      const track = await conn.query({
        queryDescriptor,
        query: Query.GetMetadata,
        args: {trackId},
      });

      return track;
    } catch (err) {
      // Connection may have been closed, remove it
      this.#connections.delete(deviceId);
      throw err;
    }
  }

  /**
   * Stop all connections
   */
  stop() {
    for (const conn of this.#connections.values()) {
      conn.close();
    }
    this.#connections.clear();
  }
}

export default PassiveRemoteDatabase;
