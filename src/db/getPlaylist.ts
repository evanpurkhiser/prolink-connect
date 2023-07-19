import {Span} from '@sentry/tracing';

import {Playlist} from 'src/entities';
import LocalDatabase from 'src/localdb';
import RemoteDatabase, {MenuTarget, Query} from 'src/remotedb';
import {DeviceID, MediaSlot, PlaylistContents, TrackType} from 'src/types';

export interface Options {
  /**
   * The playlist or folder to query the entries of. This may be left as
   * undefined to retrieve the root playlist.
   */
  playlist?: Playlist;
  /**
   * The device to query the track metadata from
   */
  deviceId: DeviceID;
  /**
   * The media slot the track is present in
   */
  mediaSlot: MediaSlot;
  /**
   * The Sentry transaction span
   */
  span?: Span;
}

export async function viaRemote(remote: RemoteDatabase, opts: Options) {
  const {playlist, deviceId, mediaSlot, span} = opts;

  const conn = await remote.get(deviceId);
  if (conn === null) {
    return null;
  }

  const queryDescriptor = {
    trackSlot: mediaSlot,
    trackType: TrackType.RB,
    menuTarget: MenuTarget.Main,
  };

  const id = playlist?.id;
  const isFolderRequest = playlist?.isFolder ?? true;

  const {folders, playlists, trackEntries} = await conn.query({
    queryDescriptor,
    query: Query.MenuPlaylist,
    args: {id, isFolderRequest},
    span,
  });

  const iterateTracks = async function* () {
    for (const entry of trackEntries) {
      if (!conn) {
        break;
      }

      yield conn.query({
        queryDescriptor,
        query: Query.GetMetadata,
        args: {trackId: entry.id},
        span,
      });
    }
  };

  const tracks = {[Symbol.asyncIterator]: iterateTracks};
  const totalTracks = trackEntries.length;

  return {folders, playlists, tracks, totalTracks} as PlaylistContents;
}

export async function viaLocal(local: LocalDatabase, opts: Options) {
  const {playlist, deviceId, mediaSlot} = opts;

  if (mediaSlot !== MediaSlot.USB && mediaSlot !== MediaSlot.SD) {
    throw new Error('Expected USB or SD slot for local database query');
  }

  const orm = await local.get(deviceId, mediaSlot);
  if (orm === null) {
    return null;
  }

  const {folders, playlists, trackEntries} = orm.findPlaylist(playlist?.id);

  const iterateTracks = async function* () {
    for (const entry of trackEntries) {
      if (!orm) {
        break;
      }
      yield orm.findTrack(entry.id);
    }
  };

  const tracks = {[Symbol.asyncIterator]: iterateTracks};
  const totalTracks = trackEntries.length;

  return {folders, playlists, tracks, totalTracks} as PlaylistContents;
}
