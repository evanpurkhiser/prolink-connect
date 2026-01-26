import {Mutex} from 'async-mutex';
import StrictEventEmitter from 'strict-event-emitter-types';

import {createHash} from 'crypto';
import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {DatabaseAdapter, DatabasePreference} from 'src/localdb/database-adapter';
import {OneLibraryAdapter} from 'src/localdb/onelibrary';
import {MetadataORM} from 'src/localdb/orm';
import {hydrateDatabase, HydrationProgress} from 'src/localdb/rekordbox';
import {fetchFile, FetchProgress} from 'src/nfs';
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

import {PassiveDeviceManager} from './devices';
import {PassiveStatusEmitter} from './status';

/**
 * Rekordbox databases will only exist within these two slots
 */
type DatabaseSlot = MediaSlot.USB | MediaSlot.SD;

interface CommonProgressOpts {
  device: Device;
  slot: MediaSlot;
}

type DownloadProgressOpts = CommonProgressOpts & {
  progress: FetchProgress;
};

type HydrationProgressOpts = CommonProgressOpts & {
  progress: HydrationProgress;
};

type HydrationDoneOpts = CommonProgressOpts;

/**
 * Events that may be triggered by the PassiveLocalDatabase emitter
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
   */
  hydrationDone: (opts: HydrationDoneOpts) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, DatabaseEvents>;

interface DatabaseItem {
  id: string;
  media: MediaSlotInfo;
  adapter: DatabaseAdapter;
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
 * PassiveLocalDatabase provides access to rekordbox databases on devices
 * using passive packet capture.
 *
 * Unlike the active LocalDatabase, this version:
 * - Cannot query for media slot info (no queryMediaSlot)
 * - Listens for mediaSlot broadcasts to cache media info
 * - Provides getWithMedia() method when media info is known
 *
 * NFS access to fetch rekordbox databases works without announcing a VCDJ.
 */
export class PassiveLocalDatabase {
  #deviceManager: PassiveDeviceManager;
  #statusEmitter: PassiveStatusEmitter;
  #emitter: Emitter = new EventEmitter();
  #slotLocks = new Map<string, Mutex>();
  #dbs: DatabaseItem[] = [];
  /**
   * Cache of media slot info received from broadcast packets
   */
  #mediaCache = new Map<string, MediaSlotInfo>();
  /**
   * Database format preference
   */
  #preference: DatabasePreference = 'auto';

  constructor(
    deviceManager: PassiveDeviceManager,
    statusEmitter: PassiveStatusEmitter,
    preference: DatabasePreference = 'auto'
  ) {
    this.#deviceManager = deviceManager;
    this.#statusEmitter = statusEmitter;
    this.#preference = preference;

    deviceManager.on('disconnected', this.#handleDeviceRemoved);
    statusEmitter.on('mediaSlot', this.#handleMediaSlot);
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
   * Get cached media slot info for a device and slot.
   * Returns undefined if no media slot info has been received.
   */
  getCachedMedia(deviceId: DeviceID, slot: DatabaseSlot): MediaSlotInfo | undefined {
    const key = `${deviceId}-${slot}`;
    return this.#mediaCache.get(key);
  }

  /**
   * Get all cached media slot info.
   */
  getAllCachedMedia(): MediaSlotInfo[] {
    return Array.from(this.#mediaCache.values());
  }

  /**
   * Disconnects the local database connection for the specified device
   */
  disconnectForDevice(device: Device) {
    this.#handleDeviceRemoved(device);
  }

  /**
   * Stop listening to events and clean up.
   */
  stop() {
    this.#deviceManager.off('disconnected', this.#handleDeviceRemoved);
    this.#statusEmitter.off('mediaSlot', this.#handleMediaSlot);

    // Close all database connections and clean up temp files
    for (const db of this.#dbs) {
      db.adapter.close();
      if (db.tempFile) {
        try {
          fs.unlinkSync(db.tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    this.#dbs = [];
    this.#mediaCache.clear();
  }

  #handleMediaSlot = (info: MediaSlotInfo) => {
    const key = `${info.deviceId}-${info.slot}`;
    this.#mediaCache.set(key, info);
  };

  #handleDeviceRemoved = (device: Device) => {
    const db = this.#dbs.find(db => db.media.deviceId === device.id);
    if (db) {
      db.adapter.close();
      if (db.tempFile) {
        try {
          fs.unlinkSync(db.tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    this.#dbs = this.#dbs.filter(db => db.media.deviceId !== device.id);

    // Clear cached media for this device
    for (const key of this.#mediaCache.keys()) {
      if (key.startsWith(`${device.id}-`)) {
        this.#mediaCache.delete(key);
      }
    }
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
   */
  #tryLoadOneLibrary = async (
    device: Device,
    slot: DatabaseSlot,
    tx: Telemetry.TelemetrySpan
  ): Promise<{adapter: OneLibraryAdapter; tempFile: string} | null> => {
    const oneLibraryPath = 'PIONEER/rekordbox/exportLibrary.db';

    try {
      const dbData = await this.#fetchFileWithFallback(device, slot, oneLibraryPath, tx);

      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `prolink-onelibrary-${device.id}-${slot}-${Date.now()}.db`);
      fs.writeFileSync(tempFile, dbData);

      const adapter = new OneLibraryAdapter(tempFile);
      return {adapter, tempFile};
    } catch {
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

  #hydrateDatabase = async (device: Device, slot: DatabaseSlot, media: MediaSlotInfo) => {
    const tx = Telemetry.startTransaction({name: 'hydrateDatabase'});

    tx.setTag('slot', getSlotName(media.slot));
    tx.setData('numTracks', media.trackCount.toString());
    tx.setTag('preference', this.#preference);

    let adapter: DatabaseAdapter;
    let tempFile: string | undefined;

    if (this.#preference === 'pdb') {
      adapter = await this.#loadPdbDatabase(device, slot, tx);
      tx.setTag('dbType', 'pdb');
    } else if (this.#preference === 'oneLibrary') {
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
   * Gets the database adapter for the media metadata in the provided device slot,
   * using cached media info.
   *
   * This method uses cached media slot info that was received from
   * broadcast packets. If no media info is cached for this slot,
   * it will attempt to fetch the database without media info (useful
   * for all-in-one units like XDJ-XZ that don't broadcast mediaSlot).
   *
   * @returns null if no rekordbox media present or fetch fails
   */
  get(deviceId: DeviceID, slot: DatabaseSlot): Promise<DatabaseAdapter | null> {
    const cachedMedia = this.getCachedMedia(deviceId, slot);
    const device = this.#deviceManager.devices.get(deviceId);

    if (!device) {
      return Promise.resolve(null);
    }

    if (cachedMedia) {
      return this.getWithMedia(device, slot, cachedMedia);
    }

    // No cached media - try fetching without media info
    // This is needed for all-in-one units (XDJ-XZ, XDJ-RX) that don't
    // broadcast mediaSlot info packets
    return this.getWithoutMedia(device, slot);
  }

  /**
   * Gets the database adapter for the media metadata using provided media slot info.
   *
   * Use this method when you have media slot info from another source
   * (e.g., parsed from status packets or provided manually).
   *
   * @returns null if no rekordbox media present
   */
  async getWithMedia(
    device: Device,
    slot: DatabaseSlot,
    media: MediaSlotInfo
  ): Promise<DatabaseAdapter | null> {
    const lockKey = `${device.id}-${slot}`;
    const lock =
      this.#slotLocks.get(lockKey) ??
      this.#slotLocks.set(lockKey, new Mutex()).get(lockKey)!;

    if (device.type !== DeviceType.CDJ) {
      throw new Error('Cannot create database from devices that are not CDJs');
    }

    if (media.tracksType !== TrackType.RB) {
      return null;
    }

    const id = getMediaId(media);

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
   * Attempts to get/hydrate a database without cached media slot info.
   * This is used for all-in-one units (XDJ-XZ, XDJ-RX, etc.) that don't
   * broadcast mediaSlot info packets.
   *
   * The method will try to fetch the rekordbox export.pdb file directly
   * via NFS. If successful, the database is hydrated and cached.
   *
   * @returns null if no rekordbox database found or fetch fails
   */
  async getWithoutMedia(device: Device, slot: DatabaseSlot) {
    const lockKey = `${device.id}-${slot}-nomedia`;
    const lock =
      this.#slotLocks.get(lockKey) ??
      this.#slotLocks.set(lockKey, new Mutex()).get(lockKey)!;

    if (device.type !== DeviceType.CDJ) {
      return null;
    }

    // Check if we already have a cached database for this device/slot
    const existingDb = this.#dbs.find(
      db => db.media.deviceId === device.id && db.media.slot === slot
    );
    if (existingDb) {
      return existingDb.adapter;
    }

    try {
      const db = await lock.runExclusive(() => {
        // Double-check cache inside lock
        const cached = this.#dbs.find(
          db => db.media.deviceId === device.id && db.media.slot === slot
        );
        if (cached) {
          return cached;
        }

        // Create synthetic media info - we assume rekordbox since we're
        // attempting to fetch a rekordbox database
        const syntheticMedia: MediaSlotInfo = {
          deviceId: device.id,
          slot,
          name: 'Unknown Media',
          color: 0,
          createdDate: new Date(0),
          freeBytes: BigInt(0),
          totalBytes: BigInt(0),
          tracksType: TrackType.RB,
          trackCount: 0,
          playlistCount: 0,
          hasSettings: false,
        };

        return this.#hydrateDatabase(device, slot, syntheticMedia);
      });

      return db.adapter;
    } catch {
      return null;
    }
  }

  /**
   * Preload the databases for all connected devices using cached media info.
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

export default PassiveLocalDatabase;
