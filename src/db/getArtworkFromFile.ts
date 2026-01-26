import {extractArtworkFromDevice, isArtworkExtractionSupported} from 'src/artwork';
import {Track} from 'src/entities';
import {NfsMediaSlot} from 'src/nfs';
import {Device, DeviceID, MediaSlot} from 'src/types';
import {TelemetrySpan as Span} from 'src/utils/telemetry';
import * as Telemetry from 'src/utils/telemetry';

export interface Options {
  deviceId: DeviceID;
  trackSlot: MediaSlot;
  track: Track;
  span?: Span;
}

/**
 * Extract artwork directly from an audio file via NFS.
 */
export async function viaFileExtraction(
  device: Device,
  opts: Options
): Promise<Buffer | null> {
  const {trackSlot, track, span} = opts;

  if (
    trackSlot !== MediaSlot.USB &&
    trackSlot !== MediaSlot.SD &&
    trackSlot !== MediaSlot.RB
  ) {
    return null;
  }

  const slot = trackSlot as NfsMediaSlot;

  if (!track.filePath) {
    return null;
  }

  const extension = track.filePath.split('.').pop()?.toLowerCase() ?? '';
  if (!isArtworkExtractionSupported(extension)) {
    return null;
  }

  const tx = span
    ? span.startChild({op: 'getArtworkFromFile'})
    : Telemetry.startTransaction({name: 'getArtworkFromFile'});

  try {
    const artwork = await extractArtworkFromDevice(device, slot, track.filePath);

    if (!artwork) {
      tx.setData('result', 'no_artwork');
      tx.finish();
      return null;
    }

    tx.setData('result', 'success');
    tx.setData('mimeType', artwork.mimeType);
    tx.setData('size', artwork.data.length);
    tx.finish();

    return artwork.data;
  } catch (error) {
    tx.setData('result', 'error');
    tx.finish();
    Telemetry.captureException(error);
    return null;
  }
}
