import {ExtractedArtwork, FileReader} from '../types';
import {extractFromMp3} from './id3';
import {createBufferReader} from '../reader';

export async function extractFromAiff(reader: FileReader): Promise<ExtractedArtwork | null> {
  const header = await reader.read(0, 12);
  if (header.length < 12 || header.toString('ascii', 0, 4) !== 'FORM') return null;

  const formType = header.toString('ascii', 8, 12);
  if (formType !== 'AIFF' && formType !== 'AIFC') return null;

  const formSize = header.readUInt32BE(4);
  const fileEnd = Math.min(8 + formSize, reader.size);

  let offset = 12;

  while (offset + 8 < fileEnd) {
    const chunkHeader = await reader.read(offset, 8);
    if (chunkHeader.length < 8) break;

    const chunkId = chunkHeader.toString('ascii', 0, 4);
    const chunkSize = chunkHeader.readUInt32BE(4);

    if (chunkSize <= 0 || offset + 8 + chunkSize > fileEnd) break;

    if (chunkId === 'ID3 ' || chunkId === 'id3 ') {
      const id3Data = await reader.read(offset + 8, chunkSize);
      const id3Reader = createBufferReader(id3Data, 'mp3');
      return extractFromMp3(id3Reader);
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return null;
}
