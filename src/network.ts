import dgram from 'dgram-as-promised';

import DeviceManager from 'src/devices';
import StatusEmitter from 'src/status';
import LocalDatabase from 'src/localdb';
import RemoteDatabase from 'src/remotedb';
import Database from 'src/db';
import {ANNOUNCE_PORT, STATUS_PORT} from 'src/constants';
import {getMatchingInterface, getBroadcastAddress} from 'src/utils';
import {Device} from 'src/types';
import {Announcer, getVirtualCDJ} from 'src/virtualcdj';

export default class ProlinkNetwork {
  /**
   * Connect to the prolink network
   */
  static async connect() {
    const network = new ProlinkNetwork();
    await network.#connect();

    return network;
  }

  #deviceManager!: DeviceManager;
  #statusEmitter!: StatusEmitter;
  #announcer!: Announcer;
  #remotedb!: RemoteDatabase;
  #localdb!: LocalDatabase;
  #database!: Database;

  #connect = async () => {
    // Socket used to listen for devices on the network
    const announceSocket = dgram.createSocket('udp4');
    await announceSocket.bind(ANNOUNCE_PORT, '0.0.0.0');
    announceSocket.setBroadcast(true);

    // Socket used to listen for status packets
    const statusSocket = dgram.createSocket('udp4');
    await statusSocket.bind(STATUS_PORT, '0.0.0.0');

    this.#deviceManager = new DeviceManager(announceSocket);
    this.#statusEmitter = new StatusEmitter(statusSocket);

    // wait for first device to appear on the network
    const firstDevice = await new Promise<Device>(resolve =>
      this.#deviceManager.once('connected', resolve)
    );
    const iface = getMatchingInterface(firstDevice.ip);

    if (iface === null) {
      throw new Error('Unable to determine network interface');
    }

    const broadcastAddr = getBroadcastAddress(iface);
    const vcdj = getVirtualCDJ(iface, 0x05);

    this.#announcer = new Announcer(vcdj, announceSocket, broadcastAddr);
    this.#announcer.start();

    this.#remotedb = new RemoteDatabase(this.#deviceManager, vcdj);
    this.#localdb = new LocalDatabase(vcdj, this.#deviceManager, this.#statusEmitter);

    this.#database = new Database(
      vcdj,
      this.#localdb,
      this.#remotedb,
      this.deviceManager
    );
  };

  /**
   * Get the @{link DeviceManager} service. This service is used to monitor and
   * react to devices connecting and disconnecting from the prolink network.
   */
  get deviceManager() {
    return this.#deviceManager;
  }

  /**
   * Get the @{link StatusEmitter} service. This service is used to monitor
   * status updates on each CDJ.
   */
  get statusEmitter() {
    return this.#statusEmitter;
  }

  /**
   * Get the @{link Database} service. This service is used to retrieve
   * metadata and listings from devices on the network, automatically choosing the
   * best strategy to access the data.
   */
  get db() {
    return this.#database;
  }

  /**
   * Get the @{link LocalDatabase} service. This service is used to query and sync
   * metadata that is downloaded directly from the rekordbox database present
   * on media connected to the CDJs.
   */
  get localdb() {
    return this.#localdb;
  }

  /**
   * Get the @{link RemoteDatabase} service. This service is used to query
   * metadata directly from the database service running on Rekordbox and the CDJs
   * themselves.
   *
   * NOTE: To use this service to access the CDJ remote database service, the
   *       Virtual CDJ must report itself as an ID between 1 and 4. This means
   *       there cannot be four physical CDJs on the network to access any CDJs
   *       remote database.
   */
  get remotedb() {
    return this.#remotedb;
  }
}
