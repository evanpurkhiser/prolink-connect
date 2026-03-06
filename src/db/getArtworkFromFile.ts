import {extractArtworkFromDevice, isArtworkExtractionSupported} from 'src/artwork';
import {Track} from 'src/entities';
import {type Logger, noopLogger} from 'src/logger';
import {NfsMediaSlot} from 'src/nfs';
import {Device, DeviceID, MediaSlot} from 'src/types';
import {getSlotName} from 'src/utils';
import {TelemetrySpan as Span} from 'src/utils/telemetry';
import * as Telemetry from 'src/utils/telemetry';

export interface Options {
  deviceId: DeviceID;
  trackSlot: MediaSlot;
  track: Track;
  span?: Span;
  logger?: Logger;
}

/**
 * Extract artwork directly from an audio file via NFS.
 */
export async function viaFileExtraction(
  device: Device,
  opts: Options
): Promise<Buffer | null> {
  const {trackSlot, track, span} = opts;
  const logger = opts.logger ?? noopLogger;

  if (
    trackSlot !== MediaSlot.USB &&
    trackSlot !== MediaSlot.SD &&
    trackSlot !== MediaSlot.RB
  ) {
    logger.debug(
      `[artwork-nfs] Skipping: unsupported slot ${getSlotName(trackSlot)} (device ${device.name})`
    );
    return null;
  }

  const slot = trackSlot as NfsMediaSlot;

  if (!track.filePath) {
    logger.debug('[artwork-nfs] Skipping: no filePath on track');
    return null;
  }

  const extension = track.filePath.split('.').pop()?.toLowerCase() ?? '';
  if (!isArtworkExtractionSupported(extension)) {
    logger.debug(`[artwork-nfs] Skipping: unsupported extension ".${extension}" (${track.filePath})`);
    return null;
  }

  logger.debug(
    `[artwork-nfs] Extracting from ${track.filePath} (slot=${getSlotName(trackSlot)}, device=${device.name} @ ${device.ip.address})`
  );

  const tx = span
    ? span.startChild({op: 'getArtworkFromFile'})
    : Telemetry.startTransaction({name: 'getArtworkFromFile'});

  try {
    const artwork = await extractArtworkFromDevice(device, slot, track.filePath, logger);

    if (!artwork) {
      logger.debug('[artwork-nfs] No embedded artwork found in file');
      tx.setData('result', 'no_artwork');
      tx.finish();
      return null;
    }

    logger.debug(
      `[artwork-nfs] Success: ${artwork.mimeType} (${artwork.data.length} bytes)`
    );
    tx.setData('result', 'success');
    tx.setData('mimeType', artwork.mimeType);
    tx.setData('size', artwork.data.length);
    tx.finish();

    return artwork.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`[artwork-nfs] NFS extraction failed: ${msg}`);
    tx.setData('result', 'error');
    tx.finish();
    Telemetry.captureException(error);
    return null;
  }
}
