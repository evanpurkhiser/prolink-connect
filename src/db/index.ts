import DeviceManager from 'src/devices';
import {Track} from 'src/entities';
import LocalDatabase from 'src/localdb';
import RemoteDatabase from 'src/remotedb';
import {
  Device,
  DeviceType,
  MediaSlot,
  PlaylistContents,
  TrackType,
  Waveforms,
} from 'src/types';
import {getSlotName, getTrackTypeName} from 'src/utils';
import * as Telemetry from 'src/utils/telemetry';
import {SpanStatus} from 'src/utils/telemetry';

import * as GetArtworkFromFile from './getArtworkFromFile';
import * as GetArtworkThumbnail from './getArtworkThumbnail';
import * as GetFile from './getFile';
import * as GetMetadata from './getMetadata';
import * as GetPlaylist from './getPlaylist';
import * as GetWaveforms from './getWaveforms';

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

  #getTrackLookupStrategy = (device: Device, type: TrackType) => {
    const isUnanalyzed = type === TrackType.AudioCD || type === TrackType.Unanalyzed;
    const requiresCdjRemote =
      device.type === DeviceType.CDJ && isUnanalyzed && this.cdjSupportsRemotedb;

    return device.type === DeviceType.Rekordbox || requiresCdjRemote
      ? LookupStrategy.Remote
      : device.type === DeviceType.CDJ && type === TrackType.RB
        ? LookupStrategy.Local
        : LookupStrategy.NoneAvailable;
  };

  #getMediaLookupStrategy = (device: Device, slot: MediaSlot) =>
    device.type === DeviceType.Rekordbox && slot === MediaSlot.RB
      ? LookupStrategy.Remote
      : device.type === DeviceType.Rekordbox
        ? LookupStrategy.NoneAvailable
        : LookupStrategy.Local;

  /**
   * Reports weather or not the CDJs can be communicated to over the remote
   * database protocol. This is important when trying to query for unanalyzed or
   * compact disc tracks.
   */
  get cdjSupportsRemotedb() {
    return this.#hostDevice.id > 0 && this.#hostDevice.id < 7;
  }

  /**
   * Retrieve metadata for a track on a specific device slot.
   */
  async getMetadata(opts: GetMetadata.Options) {
    const {deviceId, trackType, trackSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetMetadata'})
      : Telemetry.startTransaction({name: 'dbGetMetadata'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('trackType', getTrackTypeName(trackType));
    tx.setTag('trackSlot', getSlotName(trackSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      return null;
    }

    const strategy = this.#getTrackLookupStrategy(device, trackType);
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
   * Retrieves the file off a specific device slot.
   */
  async getFile(opts: GetArtworkThumbnail.Options) {
    const {deviceId, trackType, trackSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetFile'})
      : Telemetry.startTransaction({name: 'dbGetFile'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('trackType', getTrackTypeName(trackType));
    tx.setTag('trackSlot', getSlotName(trackSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      return null;
    }

    const strategy = this.#getTrackLookupStrategy(device, trackType);
    let artwork: Buffer | null = null;

    if (strategy === LookupStrategy.Remote) {
      artwork = await GetFile.viaRemote(this.#remoteDatabase, device, callOpts);
    }

    if (strategy === LookupStrategy.Local) {
      artwork = await GetFile.viaLocal(this.#localDatabase, device, callOpts);
    }

    if (strategy === LookupStrategy.NoneAvailable) {
      tx.setStatus(SpanStatus.Unavailable);
    }

    tx.finish();

    return artwork;
  }

  /**
   * Retrieves the low-resolution artwork thumbnail from the rekordbox database.
   *
   * This returns the pre-generated thumbnail stored in the rekordbox database,
   * which is typically small (around 80x80 pixels).
   *
   * For full-resolution artwork extracted from the audio file, use getArtwork().
   */
  async getArtworkThumbnail(opts: GetArtworkThumbnail.Options) {
    const {deviceId, trackType, trackSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetArtwork'})
      : Telemetry.startTransaction({name: 'dbGetArtwork'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('trackType', getTrackTypeName(trackType));
    tx.setTag('trackSlot', getSlotName(trackSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      return null;
    }

    const strategy = this.#getTrackLookupStrategy(device, trackType);
    let artwork: Buffer | null = null;

    if (strategy === LookupStrategy.Remote) {
      artwork = await GetArtworkThumbnail.viaRemote(this.#remoteDatabase, callOpts);
    }

    if (strategy === LookupStrategy.Local) {
      artwork = await GetArtworkThumbnail.viaLocal(this.#localDatabase, device, callOpts);
    }

    if (strategy === LookupStrategy.NoneAvailable) {
      tx.setStatus(SpanStatus.Unavailable);
    }

    tx.finish();

    return artwork;
  }

  /**
   * Retrieves artwork for a track by extracting it from the audio file via NFS.
   *
   * This is the primary method for getting artwork. It reads embedded artwork
   * from the audio file (ID3 tags for MP3, metadata atoms for M4A, PICTURE
   * blocks for FLAC, etc.) using partial file reads to minimize data transfer.
   *
   * For low-resolution thumbnails from the rekordbox database, use
   * getArtworkThumbnail() instead.
   */
  async getArtwork(opts: GetArtworkFromFile.Options) {
    const {deviceId, trackSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetArtwork'})
      : Telemetry.startTransaction({name: 'dbGetArtwork'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('trackSlot', getSlotName(trackSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      tx.setStatus(SpanStatus.NotFound);
      tx.finish();
      return null;
    }

    const artwork = await GetArtworkFromFile.viaFileExtraction(device, callOpts);

    tx.finish();

    return artwork;
  }

  /**
   * Retrieves the waveforms for a track on a specific device slot.
   */
  async getWaveforms(opts: GetArtworkThumbnail.Options) {
    const {deviceId, trackType, trackSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetWaveforms'})
      : Telemetry.startTransaction({name: 'dbGetWaveforms'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('trackType', getTrackTypeName(trackType));
    tx.setTag('trackSlot', getSlotName(trackSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      return null;
    }

    const strategy = this.#getTrackLookupStrategy(device, trackType);
    let waveforms: Waveforms | null = null;

    if (strategy === LookupStrategy.Remote) {
      waveforms = await GetWaveforms.viaRemote(this.#remoteDatabase, callOpts);
    }

    if (strategy === LookupStrategy.Local) {
      waveforms = await GetWaveforms.viaLocal(this.#localDatabase, device, callOpts);
    }

    if (strategy === LookupStrategy.NoneAvailable) {
      tx.setStatus(SpanStatus.Unavailable);
    }

    tx.finish();

    return waveforms;
  }

  /**
   * Retrieve folders, playlists, and tracks within the playlist tree. The id
   * may be left undefined to query the root of the playlist tree.
   *
   * NOTE: You will never receive a track list and playlists or folders at the
   * same time. But the API is simpler to combine the lookup for these.
   */
  async getPlaylist(opts: GetPlaylist.Options) {
    const {deviceId, mediaSlot, span} = opts;

    const tx = span
      ? span.startChild({op: 'dbGetPlaylist'})
      : Telemetry.startTransaction({name: 'dbGetPlaylist'});

    tx.setTag('deviceId', deviceId.toString());
    tx.setTag('mediaSlot', getSlotName(mediaSlot));

    const callOpts = {...opts, span: tx};

    const device = await this.#deviceManager.getDeviceEnsured(deviceId);
    if (device === null) {
      return null;
    }

    const strategy = this.#getMediaLookupStrategy(device, mediaSlot);
    let contents: PlaylistContents | null = null;

    if (strategy === LookupStrategy.Remote) {
      contents = await GetPlaylist.viaRemote(this.#remoteDatabase, callOpts);
    }

    if (strategy === LookupStrategy.Local) {
      contents = await GetPlaylist.viaLocal(this.#localDatabase, callOpts);
    }

    if (strategy === LookupStrategy.NoneAvailable) {
      tx.setStatus(SpanStatus.Unavailable);
    }

    tx.finish();

    return contents;
  }
}

export default Database;
