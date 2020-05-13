import {Device, DeviceType, TrackType} from 'src/types';
import RemoteDatabase from 'src/remotedb';
import LocalDatabase from 'src/localdb';
import DeviceManager from 'src/devices';

import * as GetMetadata from './getMetadata';
import * as GetArtwork from './getArtwork';

enum LookupStrategy {
  Remote,
  Local,
  NoneAvailable,
}

/**
 * A Database is the central service used to query devices on the prolink
 * network for information from their databases.
 */
class Database {
  #hostDevice: Device;
  #deviceManager: DeviceManager;
  /**
   * The local database service, used when querying media devices connected
   * directly to CDJs containing a rekordbox formatted database.
   */
  #localDatabase: LocalDatabase;
  /**
   * The remote database service, used when querying the Rekordbox software or a
   * CDJ with an unanalyzed media device connected (when possible).
   */
  #remoteDatabase: RemoteDatabase;

  constructor(
    hostDevice: Device,
    local: LocalDatabase,
    remote: RemoteDatabase,
    deviceManager: DeviceManager
  ) {
    this.#hostDevice = hostDevice;
    this.#localDatabase = local;
    this.#remoteDatabase = remote;
    this.#deviceManager = deviceManager;
  }

  #getLookupStrategy = (device: Device, type: TrackType) => {
    const isUnanalyzed = type === TrackType.AudioCD || type === TrackType.Unanalyzed;
    const requiresCdjRemote =
      device.type === DeviceType.CDJ && isUnanalyzed && this.cdjSupportsRemotedb;

    return device.type === DeviceType.Rekordbox || requiresCdjRemote
      ? LookupStrategy.Remote
      : device.type === DeviceType.CDJ && type === TrackType.RB
      ? LookupStrategy.Local
      : LookupStrategy.NoneAvailable;
  };

  /**
   * Reports weather or not the CDJs can be communcated to over the remote
   * database protocol. This is important when trying to query for unanalyzed or
   * compact disc tracks.
   */
  get cdjSupportsRemotedb() {
    return this.#hostDevice.id > 0 && this.#hostDevice.id < 5;
  }

  /**
   * Retrieve metadata for a track on a specfic device slot.
   */
  async getMetadata(opts: GetMetadata.Options) {
    const {deviceId, trackType} = opts;

    const device = this.#deviceManager.devices.get(deviceId);
    if (device === undefined) {
      return null;
    }

    const strategy = this.#getLookupStrategy(device, trackType);

    if (strategy === LookupStrategy.Remote) {
      return GetMetadata.viaRemote(this.#remoteDatabase, opts);
    }

    if (strategy === LookupStrategy.Local) {
      return GetMetadata.viaLocal(this.#localDatabase, device, opts);
    }

    return null;
  }

  /**
   * Retrives the artwork for a track on a specific device slot.
   */
  async getArtwork(opts: GetArtwork.Options) {
    const {deviceId, trackType} = opts;

    const device = this.#deviceManager.devices.get(deviceId);
    if (device === undefined) {
      return null;
    }

    const strategy = this.#getLookupStrategy(device, trackType);

    if (strategy === LookupStrategy.Remote) {
      return GetArtwork.viaRemote(this.#remoteDatabase, opts);
    }

    if (strategy === LookupStrategy.Local) {
      return GetArtwork.viaLocal(this.#localDatabase, device, opts);
    }

    return null;
  }
}

export default Database;
