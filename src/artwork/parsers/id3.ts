import {ExtractedArtwork, FileReader, PictureType} from '../types';
import {detectImageType} from './utils';

function readSyncsafe(buffer: Buffer, offset: number = 0): number {
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

function readNullTerminatedString(
  buffer: Buffer,
  offset: number,
  encoding: 'latin1' | 'utf8' | 'utf16le' | 'utf16be'
): {value: string; bytesConsumed: number} {
  const isUtf16 = encoding === 'utf16le' || encoding === 'utf16be';
  let end = offset;

  if (isUtf16) {
    while (end < buffer.length - 1) {
      if (buffer[end] === 0 && buffer[end + 1] === 0) break;
      end += 2;
    }
  } else {
    while (end < buffer.length && buffer[end] !== 0) end++;
  }

  let value: string;
  if (encoding === 'utf16be') {
    const swapped = Buffer.alloc(end - offset);
    for (let i = 0; i < end - offset; i += 2) {
      swapped[i] = buffer[offset + i + 1];
      swapped[i + 1] = buffer[offset + i];
    }
    value = swapped.toString('utf16le');
  } else {
    value = buffer.toString(encoding === 'utf16le' ? 'utf16le' : encoding, offset, end);
  }

  return {value, bytesConsumed: end - offset + (isUtf16 ? 2 : 1)};
}

function getTextEncoding(encodingByte: number): 'latin1' | 'utf8' | 'utf16le' | 'utf16be' {
  switch (encodingByte) {
    case 0: return 'latin1';
    case 1: return 'utf16le';
    case 2: return 'utf16be';
    case 3: return 'utf8';
    default: return 'latin1';
  }
}

function parseApicFrame(data: Buffer): ExtractedArtwork | null {
  if (data.length < 4) return null;

  let offset = 0;
  const encodingByte = data[offset++];
  let encoding = getTextEncoding(encodingByte);

  if (encodingByte === 1 && data.length > offset + 2) {
    const bom = data.readUInt16BE(offset);
    if (bom === 0xfeff) encoding = 'utf16be';
    else if (bom === 0xfffe) encoding = 'utf16le';
  }

  const mimeResult = readNullTerminatedString(data, offset, 'latin1');
  const mimeType = mimeResult.value;
  offset += mimeResult.bytesConsumed;

  if (offset >= data.length) return null;

  const pictureType = data[offset++] as PictureType;
  if (offset >= data.length) return null;

  const descResult = readNullTerminatedString(data, offset, encoding);
  offset += descResult.bytesConsumed;

  if (offset >= data.length) return null;

  const imageData = data.subarray(offset);
  if (imageData.length === 0) return null;

  const detectedType = detectImageType(imageData);
  const finalMimeType = detectedType ?? (mimeType.includes('png') ? 'image/png' : 'image/jpeg');

  return {data: imageData, mimeType: finalMimeType, pictureType};
}

export async function extractFromMp3(reader: FileReader): Promise<ExtractedArtwork | null> {
  const header = await reader.read(0, 10);
  if (header.length < 10 || header.toString('ascii', 0, 3) !== 'ID3') return null;

  const majorVersion = header[3];
  const flags = header[5];
  const tagSize = readSyncsafe(header, 6);

  let extendedHeaderSize = 0;
  if (flags & 0x40) {
    const extHeader = await reader.read(10, 4);
    extendedHeaderSize = majorVersion === 4 ? readSyncsafe(extHeader, 0) : extHeader.readUInt32BE(0);
  }

  const tagData = await reader.read(10 + extendedHeaderSize, tagSize - extendedHeaderSize);

  let offset = 0;
  const frameHeaderSize = majorVersion >= 3 ? 10 : 6;

  let frontCover: ExtractedArtwork | null = null;
  let anyArtwork: ExtractedArtwork | null = null;

  while (offset < tagData.length - frameHeaderSize) {
    if (tagData[offset] === 0) break;

    let frameId: string;
    let frameSize: number;

    if (majorVersion >= 3) {
      frameId = tagData.toString('ascii', offset, offset + 4);
      frameSize = majorVersion === 4 ? readSyncsafe(tagData, offset + 4) : tagData.readUInt32BE(offset + 4);
    } else {
      frameId = tagData.toString('ascii', offset, offset + 3);
      frameSize = (tagData[offset + 3] << 16) | (tagData[offset + 4] << 8) | tagData[offset + 5];
    }

    if (frameSize <= 0 || frameSize > tagData.length - offset) break;

    const frameIdNormalized = majorVersion >= 3 ? frameId : frameId === 'PIC' ? 'APIC' : frameId;

    if (frameIdNormalized === 'APIC') {
      const frameData = tagData.subarray(offset + frameHeaderSize, offset + frameHeaderSize + frameSize);
      const artwork = parseApicFrame(frameData);

      if (artwork) {
        if (artwork.pictureType === PictureType.FrontCover) frontCover = artwork;
        else if (!anyArtwork) anyArtwork = artwork;
      }
    }

    offset += frameHeaderSize + frameSize;
  }

  return frontCover ?? anyArtwork;
}
