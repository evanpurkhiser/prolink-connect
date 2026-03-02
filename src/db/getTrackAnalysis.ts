import {Track} from 'src/entities';
import LocalDatabase from 'src/localdb';
import {loadAnlz} from 'src/localdb/rekordbox';
import {Device, DeviceID, ExtendedCue, MediaSlot, SongStructure, TrackType, VocalConfig, Waveform3BandDetail, Waveform3BandPreview, WaveformHD} from 'src/types';
import {TelemetrySpan as Span} from 'src/utils/telemetry';

import {anlzLoader} from './utils';

export interface TrackAnalysis {
  /** Extended cues with colors and comments (PCO2 tag) */
  extendedCues: ExtendedCue[] | null;
  /** Song structure / phrase analysis (PSSI tag) */
  songStructure: SongStructure | null;
  /** Color waveform preview (PWV4 tag) */
  waveformColorPreview: Uint8Array | undefined;
  /** HD waveform data (PWV5 tag) */
  waveformHd: WaveformHD | null;
  /** 3-band color waveform preview (PWV6 tag from .2EX) */
  waveform3BandPreview: Waveform3BandPreview | null;
  /** 3-band color detail waveform (PWV7 tag from .2EX) */
  waveform3BandDetail: Waveform3BandDetail | null;
  /** Vocal detection config (PWVC tag from .2EX) */
  vocalConfig: VocalConfig | null;
}

export interface Options {
  deviceId: DeviceID;
  trackSlot: MediaSlot;
  trackType: TrackType;
  track: Track;
  span?: Span;
}

export async function viaLocal(
  local: LocalDatabase,
  device: Device,
  opts: Required<Options>
): Promise<TrackAnalysis | null> {
  const {deviceId, trackSlot, track} = opts;

  if (trackSlot !== MediaSlot.USB && trackSlot !== MediaSlot.SD) {
    throw new Error('Expected USB or SD slot for local database query');
  }

  const conn = await local.get(deviceId, trackSlot);
  if (conn === null) {
    return null;
  }

  const resolver = anlzLoader({device, slot: trackSlot});
  const [extResult, twoxResult] = await Promise.all([
    loadAnlz(track, 'EXT', resolver),
    loadAnlz(track, '2EX', resolver).catch(() => null),
  ]);

  return {
    extendedCues: extResult.extendedCues,
    songStructure: extResult.songStructure,
    waveformColorPreview: extResult.waveformColorPreview ?? undefined,
    waveformHd: extResult.waveformHd,
    waveform3BandPreview: twoxResult?.waveform3BandPreview ?? null,
    waveform3BandDetail: twoxResult?.waveform3BandDetail ?? null,
    vocalConfig: twoxResult?.vocalConfig ?? null,
  };
}
