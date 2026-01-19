import {Mutex} from 'async-mutex';
import StrictEventEmitter from 'strict-event-emitter-types';

import {createHash} from 'crypto';
import {EventEmitter} from 'events';

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

// Debug logging for hydration
const DEBUG = process.env.NP_PRODJLINK_TAG === '1';
function debugLog(msg: string, ...args: any[]) {
  if (DEBUG) {
    console.log(`[PassiveLocalDB] ${msg}`, ...args);
  }
}

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
  orm: MetadataORM;
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

  return createHash('sha256').update(inputs.join('.'), 'utf8').digest().toString();
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

  constructor(deviceManager: PassiveDeviceManager, statusEmitter: PassiveStatusEmitter) {
    this.#deviceManager = deviceManager;
    this.#statusEmitter = statusEmitter;

    deviceManager.on('disconnected', this.#handleDeviceRemoved);
    statusEmitter.on('mediaSlot', this.#handleMediaSlot);
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

    // Close all database connections
    for (const db of this.#dbs) {
      db.orm.close();
    }
    this.#dbs = [];
    this.#mediaCache.clear();
  }

  #handleMediaSlot = (info: MediaSlotInfo) => {
    const key = `${info.deviceId}-${info.slot}`;
    this.#mediaCache.set(key, info);
    debugLog(
      `Cached media slot info for device ${info.deviceId} slot ${getSlotName(info.slot)}`
    );
  };

  #handleDeviceRemoved = (device: Device) => {
    this.#dbs.find(db => db.media.deviceId === device.id)?.orm.close();
    this.#dbs = this.#dbs.filter(db => db.media.deviceId !== device.id);

    // Clear cached media for this device
    for (const key of this.#mediaCache.keys()) {
      if (key.startsWith(`${device.id}-`)) {
        this.#mediaCache.delete(key);
      }
    }
  };

  #hydrateDatabase = async (device: Device, slot: DatabaseSlot, media: MediaSlotInfo) => {
    const tx = Telemetry.startTransaction({name: 'hydrateDatabase'});

    tx.setTag('slot', getSlotName(media.slot));
    tx.setData('numTracks', media.trackCount.toString());

    const dbCreateTx = tx.startChild({op: 'setupDatabase'});
    const orm = new MetadataORM();
    dbCreateTx.finish();

    let pdbData = Buffer.alloc(0);

    const fetchPdbData = async (path: string) =>
      (pdbData = await fetchFile({
        device,
        slot,
        path,
        span: tx,
        onProgress: progress =>
          this.#emitter.emit('fetchProgress', {device, slot, progress}),
      }));

    // Rekordbox exports to both the `.PIONEER` and `PIONEER` folder, depending
    // on the media devices filesystem (HFS, FAT32, etc).
    const path = 'PIONEER/rekordbox/export.pdb';

    // Attempt to be semi-smart and first try the path correlating to the OS
    const attemptOrder =
      process.platform === 'win32' ? [path, `.${path}`] : [`.${path}`, path];

    try {
      await fetchPdbData(attemptOrder[0]);
    } catch {
      await fetchPdbData(attemptOrder[1]);
    }

    await hydrateDatabase({
      orm,
      pdbData,
      span: tx,
      onProgress: progress =>
        this.#emitter.emit('hydrationProgress', {device, slot, progress}),
    });
    this.#emitter.emit('hydrationDone', {device, slot});

    const db = {orm, media, id: getMediaId(media)};
    this.#dbs.push(db);

    tx.finish();

    return db;
  };

  /**
   * Gets the sqlite ORM service for a database hydrated with the media
   * metadata for the provided device slot, using cached media info.
   *
   * This method uses cached media slot info that was received from
   * broadcast packets. If no media info is cached for this slot,
   * use getWithMedia() instead.
   *
   * @returns null if no cached media info or no rekordbox media present
   */
  get(deviceId: DeviceID, slot: DatabaseSlot) {
    const cachedMedia = this.getCachedMedia(deviceId, slot);
    if (!cachedMedia) {
      debugLog(
        `get: No cached media info for device ${deviceId} slot ${getSlotName(slot)}`
      );
      return Promise.resolve(null);
    }

    const device = this.#deviceManager.devices.get(deviceId);
    if (!device) {
      debugLog(`get: Device ${deviceId} not found in device manager`);
      return Promise.resolve(null);
    }

    return this.getWithMedia(device, slot, cachedMedia);
  }

  /**
   * Gets the sqlite ORM service for a database hydrated with the media
   * metadata using provided media slot info.
   *
   * Use this method when you have media slot info from another source
   * (e.g., parsed from status packets or provided manually).
   *
   * @returns null if no rekordbox media present
   */
  async getWithMedia(device: Device, slot: DatabaseSlot, media: MediaSlotInfo) {
    const slotName = getSlotName(slot);
    debugLog(`getWithMedia: Starting for device ${device.id} slot ${slotName}`);

    const lockKey = `${device.id}-${slot}`;
    const lock =
      this.#slotLocks.get(lockKey) ??
      this.#slotLocks.set(lockKey, new Mutex()).get(lockKey)!;

    if (device.type !== DeviceType.CDJ) {
      debugLog(`getWithMedia: Device ${device.id} is not a CDJ (type: ${device.type})`);
      throw new Error('Cannot create database from devices that are not CDJs');
    }

    debugLog(
      `getWithMedia: Media info: tracksType=${media.tracksType}, trackCount=${media.trackCount}, name=${media.name}`
    );

    if (media.tracksType !== TrackType.RB) {
      debugLog(
        `getWithMedia: Device ${device.id} slot ${slotName} is not rekordbox (type: ${media.tracksType})`
      );
      return null;
    }

    const id = getMediaId(media);
    debugLog(`getWithMedia: Media ID: ${id}, checking cache...`);

    const db = await lock.runExclusive(() => {
      const cached = this.#dbs.find(db => db.id === id);
      if (cached) {
        debugLog(`getWithMedia: Found cached database for ${id}`);
        return cached;
      }
      debugLog(
        `getWithMedia: No cache, starting hydration for device ${device.id} slot ${slotName}...`
      );
      return this.#hydrateDatabase(device, slot, media);
    });

    debugLog(`getWithMedia: Completed for device ${device.id} slot ${slotName}`);
    return db.orm;
  }

  /**
   * Preload the databases for all connected devices using cached media info.
   */
  async preload() {
    const allDevices = [...this.#deviceManager.devices.values()];
    const cdjDevices = allDevices.filter(device => device.type === DeviceType.CDJ);

    debugLog(`preload: ${allDevices.length} total devices, ${cdjDevices.length} CDJs`);

    if (cdjDevices.length === 0) {
      debugLog('preload: No CDJ devices found, skipping');
      return;
    }

    const loaders = cdjDevices.map(device => {
      debugLog(`preload: Starting load for device ${device.id} (${device.name})`);
      return Promise.all([
        this.get(device.id, MediaSlot.USB)
          .then(r => {
            debugLog(
              `preload: USB slot for device ${device.id} completed: ${r ? 'has data' : 'null'}`
            );
            return r;
          })
          .catch(e => {
            debugLog(`preload: USB slot for device ${device.id} failed:`, e.message);
            throw e;
          }),
        this.get(device.id, MediaSlot.SD)
          .then(r => {
            debugLog(
              `preload: SD slot for device ${device.id} completed: ${r ? 'has data' : 'null'}`
            );
            return r;
          })
          .catch(e => {
            debugLog(`preload: SD slot for device ${device.id} failed:`, e.message);
            throw e;
          }),
      ]);
    });

    await Promise.all(loaders);
    debugLog('preload: All devices completed');
  }
}

export default PassiveLocalDatabase;
