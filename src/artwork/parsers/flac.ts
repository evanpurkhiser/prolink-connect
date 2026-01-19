import {ExtractedArtwork, FileReader, PictureType} from '../types';
import {normalizeMimeType} from './utils';

const enum MetadataBlockType {
  STREAMINFO = 0,
  PICTURE = 6,
}

function parsePictureBlock(data: Buffer): ExtractedArtwork | null {
  if (data.length < 32) return null;

  let offset = 0;

  const pictureType = data.readUInt32BE(offset) as PictureType;
  offset += 4;

  const mimeLength = data.readUInt32BE(offset);
  offset += 4;

  if (offset + mimeLength > data.length) return null;

  const mimeType = data.toString('utf8', offset, offset + mimeLength);
  offset += mimeLength;

  const descLength = data.readUInt32BE(offset);
  offset += 4 + descLength;

  if (offset + 16 > data.length) return null;

  const width = data.readUInt32BE(offset);
  offset += 4;

  const height = data.readUInt32BE(offset);
  offset += 4 + 8; // Skip depth and colors

  const imageLength = data.readUInt32BE(offset);
  offset += 4;

  if (offset + imageLength > data.length) return null;

  const imageData = data.subarray(offset, offset + imageLength);
  if (imageData.length === 0) return null;

  return {
    data: imageData,
    mimeType: normalizeMimeType(mimeType),
    width: width > 0 ? width : undefined,
    height: height > 0 ? height : undefined,
    pictureType,
  };
}

export async function extractFromFlac(reader: FileReader): Promise<ExtractedArtwork | null> {
  const signature = await reader.read(0, 4);
  if (signature.toString('ascii') !== 'fLaC') return null;

  let offset = 4;
  let isLastBlock = false;

  let frontCover: ExtractedArtwork | null = null;
  let anyArtwork: ExtractedArtwork | null = null;

  while (!isLastBlock && offset < reader.size) {
    const blockHeader = await reader.read(offset, 4);
    if (blockHeader.length < 4) break;

    isLastBlock = (blockHeader[0] & 0x80) !== 0;
    const blockType = blockHeader[0] & 0x7f;
    const blockLength = (blockHeader[1] << 16) | (blockHeader[2] << 8) | blockHeader[3];

    if (blockLength <= 0 || offset + 4 + blockLength > reader.size) break;

    if (blockType === MetadataBlockType.PICTURE) {
      const pictureData = await reader.read(offset + 4, blockLength);
      const artwork = parsePictureBlock(pictureData);

      if (artwork) {
        if (artwork.pictureType === PictureType.FrontCover) frontCover = artwork;
        else if (!anyArtwork) anyArtwork = artwork;
      }
    }

    offset += 4 + blockLength;
  }

  return frontCover ?? anyArtwork;
}
