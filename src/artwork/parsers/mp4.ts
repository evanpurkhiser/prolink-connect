import {ExtractedArtwork, FileReader, PictureType} from '../types';
import {detectImageType} from './utils';

interface AtomHeader {
  size: number;
  type: string;
  headerSize: number;
}

async function readAtomHeader(reader: FileReader, offset: number): Promise<AtomHeader | null> {
  if (offset + 8 > reader.size) return null;

  const header = await reader.read(offset, 8);
  const size = header.readUInt32BE(0);
  const type = header.toString('ascii', 4, 8);

  if (size === 1) {
    if (offset + 16 > reader.size) return null;
    const extHeader = await reader.read(offset + 8, 8);
    const extSize = Number(extHeader.readBigUInt64BE(0));
    return {size: extSize, type, headerSize: 16};
  }

  if (size === 0) return {size: reader.size - offset, type, headerSize: 8};

  return {size, type, headerSize: 8};
}

async function findAtom(
  reader: FileReader,
  startOffset: number,
  endOffset: number,
  targetType: string
): Promise<{dataOffset: number; dataSize: number} | null> {
  let offset = startOffset;

  while (offset < endOffset) {
    const header = await readAtomHeader(reader, offset);
    if (!header || header.size <= 0) break;

    if (header.type === targetType) {
      return {dataOffset: offset + header.headerSize, dataSize: header.size - header.headerSize};
    }

    offset += header.size;
  }

  return null;
}

async function findMoovAtom(reader: FileReader): Promise<{dataOffset: number; dataSize: number} | null> {
  return findAtom(reader, 0, reader.size, 'moov');
}

async function findCoverArtData(
  reader: FileReader,
  moovOffset: number,
  moovSize: number
): Promise<Buffer | null> {
  const udta = await findAtom(reader, moovOffset, moovOffset + moovSize, 'udta');
  if (!udta) return null;

  const meta = await findAtom(reader, udta.dataOffset, udta.dataOffset + udta.dataSize, 'meta');
  if (!meta) return null;

  const metaDataStart = meta.dataOffset + 4;
  const metaDataEnd = meta.dataOffset + meta.dataSize;

  const ilst = await findAtom(reader, metaDataStart, metaDataEnd, 'ilst');
  if (!ilst) return null;

  const covr = await findAtom(reader, ilst.dataOffset, ilst.dataOffset + ilst.dataSize, 'covr');
  if (!covr) return null;

  const data = await findAtom(reader, covr.dataOffset, covr.dataOffset + covr.dataSize, 'data');
  if (!data || data.dataSize < 8) return null;

  return reader.read(data.dataOffset + 8, data.dataSize - 8);
}

export async function extractFromMp4(reader: FileReader): Promise<ExtractedArtwork | null> {
  const ftypHeader = await reader.read(0, 8);
  if (ftypHeader.length < 8 || ftypHeader.toString('ascii', 4, 8) !== 'ftyp') return null;

  const moov = await findMoovAtom(reader);
  if (!moov) return null;

  const imageData = await findCoverArtData(reader, moov.dataOffset, moov.dataSize);
  if (!imageData || imageData.length === 0) return null;

  const mimeType = detectImageType(imageData) ?? 'image/jpeg';

  return {data: imageData, mimeType, pictureType: PictureType.FrontCover};
}
