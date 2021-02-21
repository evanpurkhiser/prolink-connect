import {Span} from '@sentry/tracing';

import {Track} from 'src/entities';
import LocalDatabase from 'src/localdb';
import {loadAnlz} from 'src/localdb/rekordbox';
import RemoteDatabase, {MenuTarget, Query} from 'src/remotedb';
import {Device, DeviceID, MediaSlot, TrackType, WaveformHD} from 'src/types';

import {anlzLoader} from './utils';

export type Options = {
  /**
   * The device to query the track waveforms off of
   */
  deviceId: DeviceID;
  /**
   * The media slot the track is present in
   */
  trackSlot: MediaSlot;
  /**
   * The type of track we are querying waveforms for
   */
  trackType: TrackType;
  /**
   * The track to lookup waveforms for
   */
  track: Track;
  /**
   * The Sentry transaction span
   */
  span?: Span;
};

export type Waveforms = {
  /**
   * The full-size and full-color waveform
   */
  waveformHd: WaveformHD;

  // TODO: Add other waveform types
};

export async function viaRemote(remote: RemoteDatabase, opts: Required<Options>) {
  const {deviceId, trackSlot, trackType, track, span} = opts;

  const conn = await remote.get(deviceId);
  if (conn === null) {
    return null;
  }

  const queryDescriptor = {
    trackSlot,
    trackType,
    menuTarget: MenuTarget.Main,
  };

  const waveformHd = await conn.query({
    queryDescriptor,
    query: Query.GetWaveformHD,
    args: {trackId: track.id},
    span,
  });

  return {waveformHd} as Waveforms;
}

export async function viaLocal(
  local: LocalDatabase,
  device: Device,
  opts: Required<Options>
) {
  const {deviceId, trackSlot, track} = opts;

  if (trackSlot !== MediaSlot.USB && trackSlot !== MediaSlot.SD) {
    throw new Error('Expected USB or SD slot for remote database query');
  }

  const conn = await local.get(deviceId, trackSlot);
  if (conn === null) {
    return null;
  }

  const anlz = await loadAnlz(track, 'EXT', anlzLoader({device, slot: trackSlot}));

  return {waveformHd: anlz.waveformHd} as Waveforms;
}
