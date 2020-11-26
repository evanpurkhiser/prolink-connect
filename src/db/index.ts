import * as Sentry from '@sentry/node';
import {SpanStatus} from '@sentry/tracing';

import DeviceManager from 'src/devices';
import {Track} from 'src/entities';
import LocalDatabase from 'src/localdb';
import RemoteDatabase from 'src/remotedb';
import {Device, DeviceType, TrackType} from 'src/types';
import {getSlotName, getTrackTypeName} from 'src/utils';

import * as GetArtwork from './getArtwork';
import * as GetMetadata from './getMetadata';

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
    const {deviceId, trackType, trackSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetMetadata'})
      : Sentry.startTransaction({name: 'dbGetMetadata'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('trackType', getTrackTypeName(trackType));
    tx.setTag('trackSlot', getSlotName(trackSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      return null;
    }

    const strategy = this.#getLookupStrategy(device, trackType);
    let track: Track | null = null;

    if (strategy === LookupStrategy.Remote) {
      track = await GetMetadata.viaRemote(this.#remoteDatabase, callOpts);
    }

    if (strategy === LookupStrategy.Local) {
      track = await GetMetadata.viaLocal(this.#localDatabase, device, callOpts);
    }

    if (strategy === LookupStrategy.NoneAvailable) {
      tx.setStatus(SpanStatus.Unavailable);
    }

    tx.finish();

    return track;
  }

  /**
   * Retrives the artwork for a track on a specific device slot.
   */
  async getArtwork(opts: GetArtwork.Options) {
    const {deviceId, trackType, trackSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetArtwork'})
      : Sentry.startTransaction({name: 'dbGetArtwork'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('trackType', getTrackTypeName(trackType));
    tx.setTag('trackSlot', getSlotName(trackSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      return null;
    }

    const strategy = this.#getLookupStrategy(device, trackType);
    let artwork: Buffer | null = null;

    if (strategy === LookupStrategy.Remote) {
      artwork = await GetArtwork.viaRemote(this.#remoteDatabase, callOpts);
    }

    if (strategy === LookupStrategy.Local) {
      artwork = await GetArtwork.viaLocal(this.#localDatabase, device, callOpts);
    }

    if (strategy === LookupStrategy.NoneAvailable) {
      tx.setStatus(SpanStatus.Unavailable);
    }

    tx.finish();

    return artwork;
  }
}

export default Database;
