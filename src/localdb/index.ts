import {Connection, createConnection} from 'typeorm';
import {createHash} from 'crypto';
import {EventEmitter} from 'events';
import {Mutex} from 'async-mutex';
import StrictEventEmitter from 'strict-event-emitter-types';

import {
  DeviceID,
  MediaSlot,
  MediaSlotInfo,
  Device,
  DeviceType,
  TrackType,
} from 'src/types';
import * as entities from 'src/entities';
import DeviceManager from 'src/devices';
import StatusEmitter from 'src/status';
import {fetchFile, FetchProgress} from 'src/nfs';

import {HydrationProgress, hydrateDatabase} from './rekordbox';

/**
 * Rekordbox databases will only exist within these two slots
 */
type DatabaseSlot = MediaSlot.USB | MediaSlot.SD;

type CommonProgressOpts = {
  /**
   * The device progress is being reported for
   */
  device: Device;
  /**
   * The media slot progress is being reported for
   */
  slot: MediaSlot;
};

type DownloadProgressOpts = CommonProgressOpts & {
  /**
   * The current progress of the fetch
   */
  progress: FetchProgress;
};

type HydrationPrgoressOpts = CommonProgressOpts & {
  /**
   * The current progress of the database hydration
   */
  progress: HydrationProgress;
};

/**
 * Events that may be triggered  by the LocalDatabase emitter
 */
type DatabaseEvents = {
  /**
   * Triggered when we are fetching a database from a CDJ
   */
  fetchProgress: (opts: DownloadProgressOpts) => void;
  /**
   * Triggered when we are hydrating a rekordbox database into the in-memory
   * sqlite database.
   */
  hydrationProgress: (opts: HydrationPrgoressOpts) => void;
};

type Emitter = StrictEventEmitter<EventEmitter, DatabaseEvents>;

type DatabaseItem = {
  /**
   * The uniquity identifier of the database
   */
  id: string;
  /**
   * The media device plugged into the device
   */
  media: MediaSlotInfo;
  /**
   * The open sqlite database connection
   */
  conn: Connection;
};

/**
 * Compute the identifier for media device in a CDJ. This is used to determine
 * if we have already hydrated the device or not into our local database.
 */
const getMediaId = (info: MediaSlotInfo) => {
  const inputs = [
    info.deviceId,
    info.slot,
    info.name,
    info.freeBytes,
    info.totalBytes,
    info.trackCount,
    info.createdDate,
  ];

  return createHash('sha256').update(inputs.join('.'), 'utf8').digest().toString();
};

const newDatabaseConnection = () =>
  createConnection({
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
  });

/**
 * The local database is responsible for syncing the remote rekordbox databases
 * of media slots on a device into in-memory sqlite databases.
 *
 * This service will attempt to ensure the in-memory databases for each media
 * device that is connected to a CDJ is locally kept in sync. Fetching the
 * database for any media slot of it's not already cached.
 */
class LocalDatabase {
  #hostDevice: Device;
  #deviceManager: DeviceManager;
  #statusEmitter: StatusEmitter;
  /**
   * The EventEmitter that will report database events
   */
  #emitter: Emitter = new EventEmitter();
  /**
   * Locks for each device slot: ${device.id}-${slot}. Used when making track
   * requets.
   */
  #slotLocks = new Map<string, Mutex>();
  /**
   * The current available databases
   */
  #dbs: DatabaseItem[] = [];

  constructor(
    hostDevice: Device,
    deviceManager: DeviceManager,
    statusEmitter: StatusEmitter
  ) {
    this.#hostDevice = hostDevice;
    this.#deviceManager = deviceManager;
    this.#statusEmitter = statusEmitter;

    deviceManager.on('disconnected', this.#handleDeviceRemoved);
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Closes the database connection and removes the database entry when a
   * device is removed.
   */
  #handleDeviceRemoved = (device: Device) => {
    this.#dbs.find(db => db.media.deviceId === device.id)?.conn.close();
    this.#dbs = this.#dbs.filter(db => db.media.deviceId !== device.id);
  };

  /**
   * Downloads and hydrates a new in-memory sqlite database
   */
  #hydrateDatabase = async (device: Device, slot: DatabaseSlot, media: MediaSlotInfo) => {
    const pdbData = await fetchFile({
      device,
      slot,
      path: '.PIONEER/rekordbox/export.pdb',
      onProgress: progress =>
        this.#emitter.emit('fetchProgress', {device, slot, progress}),
    });

    const conn = await newDatabaseConnection();
    await hydrateDatabase({
      conn,
      pdbData,
      onProgress: progress =>
        this.#emitter.emit('hydrationProgress', {device, slot, progress}),
    });

    const db = {conn, media, id: getMediaId(media)};
    this.#dbs.push(db);

    return db;
  };

  /**
   * Gets the Typeorm database connection to a database hydrated with the media
   * metadata for the provided device slot.
   *
   * If the database has not already been hydrated this will first hydrate the
   * database, which may take some time depending on the size of the database.
   *
   * @returns null if no rekordbox media present
   */
  async get(deviceId: DeviceID, slot: DatabaseSlot) {
    const lockKey = `${deviceId}-${slot}`;
    const lock =
      this.#slotLocks.get(lockKey) ??
      this.#slotLocks.set(lockKey, new Mutex()).get(lockKey)!;

    const device = this.#deviceManager.devices.get(deviceId);
    if (device === undefined) {
      return null;
    }

    if (device.type !== DeviceType.CDJ) {
      throw new Error('Cannot create database from devices that are not CDJs');
    }

    const media = await this.#statusEmitter.queryMediaSlot({
      hostDevice: this.#hostDevice,
      device,
      slot,
    });

    if (media.tracksType !== TrackType.RB) {
      return null;
    }

    const id = getMediaId(media);

    // Aquire a lock for this device slot that will not release until we've
    // guarnteed the existance of the database.
    const db = await lock.runExclusive(
      async () =>
        this.#dbs.find(db => db.id === id) ??
        (await this.#hydrateDatabase(device, slot, media))
    );

    return db.conn;
  }

  /**
   * Preload the databases for all connected devices.
   */
  async preload() {
    const loaders = [...this.#deviceManager.devices.values()]
      .filter(device => device.type === DeviceType.CDJ)
      .map(device =>
        Promise.all([
          this.get(device.id, MediaSlot.USB),
          this.get(device.id, MediaSlot.SD),
        ])
      );

    await Promise.all(loaders);
  }
}

export default LocalDatabase;
