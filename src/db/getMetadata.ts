import LocalDatabase from 'src/localdb';
import RemoteDatabase, {MenuTarget, Query} from 'src/remotedb';
import {DeviceID, MediaSlot, TrackType, Device} from 'src/types';
import {Track} from 'src/entities';
import {fetchFile} from 'src/nfs';
import {hydrateAnlz} from 'src/localdb/rekordbox';

export type Options = {
  /**
   * The device to query the track metadata from
   */
  deviceId: DeviceID;
  /**
   * The media slot the track is present in
   */
  trackSlot: MediaSlot;
  /**
   * The type of track we are querying for
   */
  trackType: TrackType;
  /**
   * The track id to retrive metadata for
   */
  trackId: number;
};

export async function viaRemote(remote: RemoteDatabase, opts: Options) {
  const {deviceId, trackSlot, trackType, trackId} = opts;

  const conn = await remote.get(deviceId);
  if (conn === null) {
    return null;
  }

  const queryDescriptor = {
    trackSlot,
    trackType,
    menuTarget: MenuTarget.Main,
  };

  const track = await conn.query({
    queryDescriptor,
    query: Query.GetMetadata,
    args: {trackId},
  });

  track.filePath = await conn.query({
    queryDescriptor,
    query: Query.GetTrackInfo,
    args: {trackId},
  });

  track.beatGrid = await conn.query({
    queryDescriptor,
    query: Query.GetBeatGrid,
    args: {trackId},
  });

  return track;
}

export async function viaLocal(local: LocalDatabase, device: Device, opts: Options) {
  const {deviceId, trackSlot, trackId} = opts;

  if (trackSlot !== MediaSlot.USB && trackSlot !== MediaSlot.SD) {
    throw new Error('Expected USB or SD slot for remote database query');
  }

  const conn = await local.get(deviceId, trackSlot);
  if (conn === null) {
    return null;
  }

  const track = await conn.getRepository(Track).findOne({where: {id: trackId}});

  if (track === undefined) {
    return null;
  }

  await hydrateAnlz(track, 'DAT', async path =>
    fetchFile({device, slot: trackSlot, path})
  );

  return track;
}
