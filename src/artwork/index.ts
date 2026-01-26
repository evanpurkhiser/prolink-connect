import {getFileInfo, NfsMediaSlot} from 'src/nfs';
import {Device} from 'src/types';

import {
  extractFromAiff,
  extractFromFlac,
  extractFromMp3,
  extractFromMp4,
} from './parsers';
import {createNfsFileReader} from './reader';
import {ExtractedArtwork, FileReader} from './types';

export {
  createBufferReader,
  createNfsFileReader,
  createNfsFileReaderWithInfo,
} from './reader';
export type {ExtractedArtwork, FileReader} from './types';
export {PictureType} from './types';

const SUPPORTED_EXTENSIONS = new Set(['mp3', 'm4a', 'mp4', 'aac', 'flac', 'aiff', 'aif']);

export function isArtworkExtractionSupported(extension: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
}

export async function extractArtwork(
  reader: FileReader
): Promise<ExtractedArtwork | null> {
  const ext = reader.extension.toLowerCase();

  switch (ext) {
    case 'mp3':
      return extractFromMp3(reader);
    case 'm4a':
    case 'mp4':
    case 'aac':
      return extractFromMp4(reader);
    case 'flac':
      return extractFromFlac(reader);
    case 'aiff':
    case 'aif':
      return extractFromAiff(reader);
    default: {
      const mp3Result = await extractFromMp3(reader);
      if (mp3Result) {
        return mp3Result;
      }
      return extractFromMp4(reader);
    }
  }
}

export async function extractArtworkFromDevice(
  device: Device,
  slot: NfsMediaSlot,
  filePath: string
): Promise<ExtractedArtwork | null> {
  const fileInfo = await getFileInfo({device, slot, path: filePath});
  const reader = createNfsFileReader(device, slot, filePath, fileInfo.size);
  return extractArtwork(reader);
}
