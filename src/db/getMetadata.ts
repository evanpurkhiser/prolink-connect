import {Span} from '@sentry/tracing';

import LocalDatabase from 'src/localdb';
import {hydrateAnlz} from 'src/localdb/rekordbox';
import {fetchFile} from 'src/nfs';
import RemoteDatabase, {MenuTarget, Query} from 'src/remotedb';
import {Device, DeviceID, MediaSlot, TrackType} from 'src/types';

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
  /**
   * The Sentry transaction span
   */
  span?: Span;
};

export async function viaRemote(remote: RemoteDatabase, opts: Required<Options>) {
  const {deviceId, trackSlot, trackType, trackId, span} = opts;

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
    span,
  });

  track.filePath = await conn.query({
    queryDescriptor,
    query: Query.GetTrackInfo,
    args: {trackId},
    span,
  });

  track.beatGrid = await conn.query({
    queryDescriptor,
    query: Query.GetBeatGrid,
    args: {trackId},
    span,
  });

  return track;
}

export async function viaLocal(
  local: LocalDatabase,
  device: Device,
  opts: Required<Options>
) {
  const {deviceId, trackSlot, trackId} = opts;

  if (trackSlot !== MediaSlot.USB && trackSlot !== MediaSlot.SD) {
    throw new Error('Expected USB or SD slot for remote database query');
  }

  const orm = await local.get(deviceId, trackSlot);
  if (orm === null) {
    return null;
  }

  const track = orm.findTrack(trackId);

  if (track === null) {
    return null;
  }

  await Promise.all([
    hydrateAnlz(track, 'DAT', path => fetchFile({device, slot: trackSlot, path})),
    hydrateAnlz(track, 'EXT', path => fetchFile({device, slot: trackSlot, path})),
  ]);

  return track;
}
