import {extractMetadata, isExtensionSupported} from 'metadata-connect';
import type {ExtractedMetadata, FileReader} from 'metadata-connect';
import {getFileInfo, NfsMediaSlot} from './nfs';
import {Device} from './types';
import {createNfsFileReader} from './artwork/reader';

export type {ExtractedMetadata} from 'metadata-connect';

/**
 * Extract full metadata from an audio file using a FileReader.
 *
 * This is the low-level API that works with any FileReader implementation.
 * For extracting from a Pro DJ Link device, use extractMetadataFromDevice.
 *
 * @param reader - FileReader interface for reading file data
 * @returns Extracted metadata, or null if extraction fails
 */
export async function extractFullMetadata(
  reader: FileReader
): Promise<ExtractedMetadata | null> {
  return extractMetadata(reader);
}

/**
 * Check if metadata extraction is supported for a file extension.
 *
 * @param extension - File extension (with or without leading dot)
 * @returns true if the extension is supported
 */
export function isMetadataExtractionSupported(extension: string): boolean {
  return isExtensionSupported(extension);
}

/**
 * Extract full metadata from an audio file on a Pro DJ Link device.
 *
 * This function reads only the necessary bytes from the file header,
 * avoiding the need to transfer entire audio files over the network.
 *
 * @param device - The Pro DJ Link device
 * @param slot - The media slot containing the file (USB, SD, etc.)
 * @param filePath - The file path on the device
 * @returns Extracted metadata, or null if extraction fails
 *
 * @example
 * ```typescript
 * // Extract metadata when a track is loaded
 * const metadata = await extractMetadataFromDevice(device, slot, filePath);
 * if (metadata) {
 *   console.log(metadata.title, metadata.artist, metadata.bpm);
 *   if (metadata.artwork) {
 *     // Display artwork
 *   }
 * }
 * ```
 */
export async function extractMetadataFromDevice(
  device: Device,
  slot: NfsMediaSlot,
  filePath: string
): Promise<ExtractedMetadata | null> {
  // Get file extension and check if supported
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (!isExtensionSupported(extension)) {
    return null;
  }

  try {
    const fileInfo = await getFileInfo({device, slot, path: filePath});
    if (fileInfo.size === 0) {
      return null;
    }

    const reader = createNfsFileReader(device, slot, filePath, fileInfo.size);
    return extractMetadata(reader);
  } catch {
    // Return null on any error (file not found, network issues, etc.)
    return null;
  }
}
