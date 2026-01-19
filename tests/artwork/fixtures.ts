// Tiny 1x1 red JPEG image
export const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06,
  0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d,
  0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
  0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28,
  0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01,
  0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
  0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01,
  0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
]);

// Tiny 1x1 PNG image
export const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
  0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08,
  0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe,
  0xd4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function writeSyncsafe(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf[0] = (value >> 21) & 0x7f;
  buf[1] = (value >> 14) & 0x7f;
  buf[2] = (value >> 7) & 0x7f;
  buf[3] = value & 0x7f;
  return buf;
}

export function createMp3WithArtwork(imageData: Buffer, pictureType = 3): Buffer {
  const mimeType = Buffer.from('image/jpeg\0', 'latin1');
  const description = Buffer.from('\0', 'latin1');

  const apicPayload = Buffer.concat([
    Buffer.from([0x00]),
    mimeType,
    Buffer.from([pictureType]),
    description,
    imageData,
  ]);

  const apicFrame = Buffer.concat([
    Buffer.from('APIC', 'ascii'),
    writeSyncsafe(apicPayload.length),
    Buffer.from([0x00, 0x00]),
    apicPayload,
  ]);

  const id3Header = Buffer.concat([
    Buffer.from('ID3', 'ascii'),
    Buffer.from([0x04, 0x00]),
    Buffer.from([0x00]),
    writeSyncsafe(apicFrame.length),
  ]);

  return Buffer.concat([id3Header, apicFrame]);
}

export function createFlacWithArtwork(imageData: Buffer, pictureType = 3): Buffer {
  const mimeType = Buffer.from('image/jpeg', 'utf8');

  const pictureData = Buffer.alloc(32 + mimeType.length + imageData.length);
  let offset = 0;

  pictureData.writeUInt32BE(pictureType, offset);
  offset += 4;
  pictureData.writeUInt32BE(mimeType.length, offset);
  offset += 4;
  mimeType.copy(pictureData, offset);
  offset += mimeType.length;
  pictureData.writeUInt32BE(0, offset);
  offset += 4;
  pictureData.writeUInt32BE(1, offset);
  offset += 4;
  pictureData.writeUInt32BE(1, offset);
  offset += 4;
  pictureData.writeUInt32BE(24, offset);
  offset += 4;
  pictureData.writeUInt32BE(0, offset);
  offset += 4;
  pictureData.writeUInt32BE(imageData.length, offset);
  offset += 4;
  imageData.copy(pictureData, offset);

  const streaminfoData = Buffer.alloc(34);
  const streaminfoHeader = Buffer.alloc(4);
  streaminfoHeader[0] = 0x00;
  streaminfoHeader[3] = 34;

  const pictureHeader = Buffer.alloc(4);
  pictureHeader[0] = 0x80 | 0x06;
  pictureHeader[1] = (pictureData.length >> 16) & 0xff;
  pictureHeader[2] = (pictureData.length >> 8) & 0xff;
  pictureHeader[3] = pictureData.length & 0xff;

  return Buffer.concat([
    Buffer.from('fLaC', 'ascii'),
    streaminfoHeader,
    streaminfoData,
    pictureHeader,
    pictureData,
  ]);
}

export function createMp4WithArtwork(imageData: Buffer): Buffer {
  const createAtom = (type: string, data: Buffer): Buffer => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + data.length, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, data]);
  };

  const dataContent = Buffer.alloc(8 + imageData.length);
  dataContent.writeUInt32BE(13, 0);
  dataContent.writeUInt32BE(0, 4);
  imageData.copy(dataContent, 8);

  const dataAtom = createAtom('data', dataContent);
  const covrAtom = createAtom('covr', dataAtom);
  const ilstAtom = createAtom('ilst', covrAtom);
  const metaContent = Buffer.concat([Buffer.alloc(4), ilstAtom]);
  const metaAtom = createAtom('meta', metaContent);
  const udtaAtom = createAtom('udta', metaAtom);
  const moovAtom = createAtom('moov', udtaAtom);

  const ftypContent = Buffer.from('M4A \x00\x00\x00\x00M4A mp42isom', 'binary');
  const ftypAtom = createAtom('ftyp', ftypContent);

  return Buffer.concat([ftypAtom, moovAtom]);
}

export function createAiffWithArtwork(imageData: Buffer): Buffer {
  const id3Data = createMp3WithArtwork(imageData);

  const commData = Buffer.alloc(18);
  commData.writeInt16BE(1, 0);
  commData.writeInt16BE(16, 6);

  const commChunk = Buffer.alloc(8 + commData.length);
  commChunk.write('COMM', 0, 4, 'ascii');
  commChunk.writeUInt32BE(commData.length, 4);
  commData.copy(commChunk, 8);

  const id3Chunk = Buffer.alloc(8 + id3Data.length + (id3Data.length % 2));
  id3Chunk.write('ID3 ', 0, 4, 'ascii');
  id3Chunk.writeUInt32BE(id3Data.length, 4);
  id3Data.copy(id3Chunk, 8);

  const formContent = Buffer.concat([Buffer.from('AIFF', 'ascii'), commChunk, id3Chunk]);

  const formHeader = Buffer.alloc(8);
  formHeader.write('FORM', 0, 4, 'ascii');
  formHeader.writeUInt32BE(formContent.length, 4);

  return Buffer.concat([formHeader, formContent]);
}
