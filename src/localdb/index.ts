import {Mutex} from 'async-mutex';
import StrictEventEmitter from 'strict-event-emitter-types';

import {createHash} from 'crypto';
import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import DeviceManager from 'src/devices';
import {fetchFile, FetchProgress} from 'src/nfs';
import StatusEmitter from 'src/status';
import {
  Device,
  DeviceID,
  DeviceType,
  MediaSlot,
  MediaSlotInfo,
  TrackType,
} from 'src/types';
import {getSlotName} from 'src/utils';
import * as Telemetry from 'src/utils/telemetry';

import {DatabaseAdapter, DatabasePreference, DatabaseType} from './database-adapter';
import {OneLibraryAdapter} from './onelibrary';
import {MetadataORM} from './orm';
import {hydrateDatabase, HydrationProgress} from './rekordbox';

/**
 * Rekordbox databases will only exist within these two slots
 */
type DatabaseSlot = MediaSlot.USB | MediaSlot.SD;

interface CommonProgressOpts {
  /**
   * The device progress is being reported for
   */
  device: Device;
  /**
   * The media slot progress is being reported for
   */
  slot: MediaSlot;
}

type DownloadProgressOpts = CommonProgressOpts & {
  /**
   * The current progress of the fetch
   */
  progress: FetchProgress;
};

type HydrationProgressOpts = CommonProgressOpts & {
  /**
   * The current progress of the database hydration
   */
  progress: HydrationProgress;
};

type HydrationDoneOpts = CommonProgressOpts;

/**
 * Events that may be triggered  by the LocalDatabase emitter
 */
interface DatabaseEvents {
  /**
   * Triggered when we are fetching a database from a CDJ
   */
  fetchProgress: (opts: DownloadProgressOpts) => void;
  /**
   * Triggered when we are hydrating a rekordbox database into the in-memory
   * sqlite database.
   */
  hydrationProgress: (opts: HydrationProgressOpts) => void;
  /**
   * Triggered when the database has been fully hydrated.
   *
   * There is a period of time between hydrationProgress reporting 100% copletion,
   * and the database being flushed, so it may be useful to wait for this event
   * before considering the database to be fully hydrated.
   */
  hydrationDone: (opts: HydrationDoneOpts) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, DatabaseEvents>;

interface DatabaseItem {
  /**
   * The uniquity identifier of the database
   */
  id: string;
  /**
   * The media device plugged into the device
   */
  media: MediaSlotInfo;
  /**
   * The database adapter instance (MetadataORM or OneLibraryAdapter)
   */
  adapter: DatabaseAdapter;
  /**
   * Path to temp file (for OneLibrary), needs cleanup on close
   */
  tempFile?: string;
}

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

  return createHash('sha256').update(inputs.join('.'), 'utf8').digest('hex');
};

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
  /**
   * Database format preference
   */
  #preference: DatabasePreference = 'auto';

  constructor(
    hostDevice: Device,
    deviceManager: DeviceManager,
    statusEmitter: StatusEmitter,
    preference: DatabasePreference = 'auto'
  ) {
    this.#hostDevice = hostDevice;
    this.#deviceManager = deviceManager;
    this.#statusEmitter = statusEmitter;
    this.#preference = preference;

    deviceManager.on('disconnected', this.#handleDeviceRemoved);
  }

  /**
   * Get the current database preference
   */
  get preference(): DatabasePreference {
    return this.#preference;
  }

  /**
   * Set the database preference. Only affects newly loaded databases.
   */
  set preference(value: DatabasePreference) {
    this.#preference = value;
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Disconnects the local database connection for the specified device
   */
  disconnectForDevice(device: Device) {
    this.#handleDeviceRemoved(device);
  }

  /**
   * Closes the database connection and removes the database entry when a
   * device is removed.
   */
  #handleDeviceRemoved = (device: Device) => {
    const db = this.#dbs.find(db => db.media.deviceId === device.id);
    if (db) {
      db.adapter.close();
      // Clean up temp file if it exists (OneLibrary databases)
      if (db.tempFile) {
        try {
          fs.unlinkSync(db.tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    this.#dbs = this.#dbs.filter(db => db.media.deviceId !== device.id);
  };

  /**
   * Helper to fetch a file from device, trying both dotted and non-dotted paths
   */
  #fetchFileWithFallback = async (
    device: Device,
    slot: DatabaseSlot,
    basePath: string,
    tx: Telemetry.TelemetrySpan
  ): Promise<Buffer> => {
    const attemptOrder =
      process.platform === 'win32' ? [basePath, `.${basePath}`] : [`.${basePath}`, basePath];

    try {
      return await fetchFile({
        device,
        slot,
        path: attemptOrder[0],
        span: tx,
        onProgress: progress => this.#emitter.emit('fetchProgress', {device, slot, progress}),
      });
    } catch {
      return await fetchFile({
        device,
        slot,
        path: attemptOrder[1],
        span: tx,
        onProgress: progress => this.#emitter.emit('fetchProgress', {device, slot, progress}),
      });
    }
  };

  /**
   * Try to load OneLibrary database (exportLibrary.db).
   * Returns the adapter and temp file path, or null if not available.
   */
  #tryLoadOneLibrary = async (
    device: Device,
    slot: DatabaseSlot,
    tx: Telemetry.TelemetrySpan
  ): Promise<{adapter: OneLibraryAdapter; tempFile: string} | null> => {
    const oneLibraryPath = 'PIONEER/rekordbox/exportLibrary.db';

    try {
      const dbData = await this.#fetchFileWithFallback(device, slot, oneLibraryPath, tx);

      // Write to temp file (OneLibrary requires file path for SQLCipher)
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `prolink-onelibrary-${device.id}-${slot}-${Date.now()}.db`);
      fs.writeFileSync(tempFile, dbData);

      const adapter = new OneLibraryAdapter(tempFile);
      return {adapter, tempFile};
    } catch {
      // OneLibrary not available
      return null;
    }
  };

  /**
   * Load PDB database (export.pdb) and hydrate into MetadataORM.
   */
  #loadPdbDatabase = async (
    device: Device,
    slot: DatabaseSlot,
    tx: Telemetry.TelemetrySpan
  ): Promise<MetadataORM> => {
    const pdbPath = 'PIONEER/rekordbox/export.pdb';
    const pdbData = await this.#fetchFileWithFallback(device, slot, pdbPath, tx);

    const dbCreateTx = tx.startChild({op: 'setupDatabase'});
    const orm = new MetadataORM();
    dbCreateTx.finish();

    await hydrateDatabase({
      orm,
      pdbData,
      span: tx,
      onProgress: progress => this.#emitter.emit('hydrationProgress', {device, slot, progress}),
    });

    return orm;
  };

  /**
   * Downloads and loads a database from a device.
   * Respects the database preference setting:
   * - 'auto': Try OneLibrary first, fall back to PDB
   * - 'oneLibrary': Only use OneLibrary
   * - 'pdb': Only use PDB
   */
  #hydrateDatabase = async (device: Device, slot: DatabaseSlot, media: MediaSlotInfo) => {
    const tx = Telemetry.startTransaction({name: 'hydrateDatabase'});

    tx.setTag('slot', getSlotName(media.slot));
    tx.setData('numTracks', media.trackCount.toString());
    tx.setTag('preference', this.#preference);

    let adapter: DatabaseAdapter;
    let tempFile: string | undefined;

    if (this.#preference === 'pdb') {
      // PDB only
      adapter = await this.#loadPdbDatabase(device, slot, tx);
      tx.setTag('dbType', 'pdb');
    } else if (this.#preference === 'oneLibrary') {
      // OneLibrary only
      const oneLibraryResult = await this.#tryLoadOneLibrary(device, slot, tx);
      if (!oneLibraryResult) {
        throw new Error('OneLibrary database not found and preference is set to oneLibrary only');
      }
      adapter = oneLibraryResult.adapter;
      tempFile = oneLibraryResult.tempFile;
      tx.setTag('dbType', 'oneLibrary');
    } else {
      // Auto: Try OneLibrary first, fall back to PDB
      const oneLibraryResult = await this.#tryLoadOneLibrary(device, slot, tx);

      if (oneLibraryResult) {
        adapter = oneLibraryResult.adapter;
        tempFile = oneLibraryResult.tempFile;
        tx.setTag('dbType', 'oneLibrary');
      } else {
        adapter = await this.#loadPdbDatabase(device, slot, tx);
        tx.setTag('dbType', 'pdb');
      }
    }

    this.#emitter.emit('hydrationDone', {device, slot});

    const db: DatabaseItem = {adapter, media, id: getMediaId(media), tempFile};
    this.#dbs.push(db);

    tx.finish();

    return db;
  };

  /**
   * Gets the database adapter for the media metadata in the provided device slot.
   *
   * If the database has not already been loaded this will first fetch and load the
   * database, which may take some time depending on the size of the database.
   *
   * @returns null if no rekordbox media present
   */
  async get(deviceId: DeviceID, slot: DatabaseSlot): Promise<DatabaseAdapter | null> {
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

    let media;
    try {
      media = await this.#statusEmitter.queryMediaSlot({
        hostDevice: this.#hostDevice,
        device,
        slot,
      });
    } catch {
      // Timeout or other error - treat as no media
      return null;
    }

    if (media.tracksType !== TrackType.RB) {
      return null;
    }

    const id = getMediaId(media);

    // Acquire a lock for this device slot that will not release until we've
    // guaranteed the existence of the database.
    const db = await lock.runExclusive(() => {
      const cached = this.#dbs.find(db => db.id === id);
      if (cached) {
        return cached;
      }
      return this.#hydrateDatabase(device, slot, media);
    });

    return db.adapter;
  }

  /**
   * Get the database type for an already-loaded device slot.
   * Returns null if no database is loaded for that device/slot.
   */
  getDatabaseType(deviceId: DeviceID, slot: DatabaseSlot): DatabaseType | null {
    const db = this.#dbs.find(
      db => db.media.deviceId === deviceId && db.media.slot === slot
    );
    return db?.adapter.type ?? null;
  }

  /**
   * Preload the databases for all connected devices.
   */
  async preload() {
    const allDevices = [...this.#deviceManager.devices.values()];
    const cdjDevices = allDevices.filter(device => device.type === DeviceType.CDJ);

    if (cdjDevices.length === 0) {
      return;
    }

    const loaders = cdjDevices.map(device =>
      Promise.all([this.get(device.id, MediaSlot.USB), this.get(device.id, MediaSlot.SD)])
    );

    await Promise.all(loaders);
  }
}

export default LocalDatabase;
