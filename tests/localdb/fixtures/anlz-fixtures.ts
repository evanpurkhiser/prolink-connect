/**
 * ANLZ Binary Fixtures
 *
 * Creates binary ANLZ files for testing the parsing functions without
 * needing real hardware or actual analyzed tracks.
 *
 * ANLZ file format:
 * - Header: "PMAI" magic (4 bytes) + header length (4 bytes) + file length (4 bytes)
 * - Sections: Each section has fourcc (4 bytes) + header length (4 bytes) + tag length (4 bytes) + body
 */

// Section tag constants (big-endian)
export const SectionTags = {
  BEAT_GRID: 0x5051545a, // PQTZ
  CUES: 0x50434f42, // PCOB
  CUES_2: 0x50434f32, // PCO2
  PATH: 0x50505448, // PPTH
  VBR: 0x50564252, // PVBR
  WAVE_PREVIEW: 0x50574156, // PWAV
  WAVE_TINY: 0x50575632, // PWV2
  WAVE_SCROLL: 0x50575633, // PWV3
  WAVE_COLOR_PREVIEW: 0x50575634, // PWV4
  WAVE_COLOR_SCROLL: 0x50575635, // PWV5
  WAVE_COLOR_3CHANNEL: 0x50575636, // PWV6
  WAVE_HD: 0x50575637, // PWV7
  SONG_STRUCTURE: 0x50535349, // PSSI
  VOCAL_CONFIG: 0x50575643, // PWVC
} as const;

/**
 * Write a big-endian 32-bit unsigned integer to a buffer
 */
function writeUInt32BE(buffer: Buffer, value: number, offset: number): void {
  buffer.writeUInt32BE(value, offset);
}

/**
 * Write a big-endian 16-bit unsigned integer to a buffer
 */
function writeUInt16BE(buffer: Buffer, value: number, offset: number): void {
  buffer.writeUInt16BE(value, offset);
}

/**
 * Create an ANLZ file header
 */
function createAnlzHeader(fileLength: number): Buffer {
  const header = Buffer.alloc(12);
  header.write('PMAI', 0, 4, 'ascii'); // Magic
  writeUInt32BE(header, 12, 4); // Header length
  writeUInt32BE(header, fileLength, 8); // File length
  return header;
}

/**
 * Create a section header
 */
function createSectionHeader(
  fourcc: number,
  bodyLength: number
): Buffer {
  const header = Buffer.alloc(12);
  writeUInt32BE(header, fourcc, 0); // Section tag
  writeUInt32BE(header, 12, 4); // Header length (always 12)
  writeUInt32BE(header, 12 + bodyLength, 8); // Total tag length
  return header;
}

/**
 * Create a PWV6 (wave_color_3channel) section
 */
export function createPWV6Section(options: {
  numEntries?: number;
  numChannels?: number;
  data?: Uint8Array;
} = {}): Buffer {
  const numEntries = options.numEntries ?? 100;
  const numChannels = options.numChannels ?? 3;
  const entryBytes = 3;
  const dataLength = numEntries * entryBytes;

  // Create waveform data if not provided
  const data =
    options.data ?? new Uint8Array(dataLength).fill(0).map((_, i) => i % 256);

  // Body: len_entry_bytes(4) + num_channels(4) + len_entries(4) + unknown(4) + unknown(4) + entries
  const bodyLength = 4 + 4 + 4 + 4 + 4 + dataLength;
  const body = Buffer.alloc(bodyLength);

  let offset = 0;
  writeUInt32BE(body, entryBytes, offset); offset += 4; // len_entry_bytes
  writeUInt32BE(body, numChannels, offset); offset += 4; // num_channels
  writeUInt32BE(body, numEntries, offset); offset += 4; // len_entries
  writeUInt32BE(body, 0, offset); offset += 4; // unknown1
  writeUInt32BE(body, 0, offset); offset += 4; // unknown2
  Buffer.from(data).copy(body, offset); // entries

  const header = createSectionHeader(SectionTags.WAVE_COLOR_3CHANNEL, bodyLength);
  return Buffer.concat([header, body]);
}

/**
 * Create a PWV7 (wave_hd) section
 */
export function createPWV7Section(options: {
  numEntries?: number;
  numChannels?: number;
  samplesPerBeat?: number;
  data?: Uint8Array;
} = {}): Buffer {
  const numEntries = options.numEntries ?? 1000;
  const numChannels = options.numChannels ?? 3;
  const samplesPerBeat = options.samplesPerBeat ?? 150;
  const entryBytes = 3; // RGB
  const dataLength = numEntries * entryBytes;

  // Create waveform data if not provided
  const data =
    options.data ?? new Uint8Array(dataLength).fill(0).map((_, i) => i % 256);

  // Body: len_entry_bytes(4) + num_channels(4) + len_entries(4) + samples_per_beat(2) + unknown(2) + entries
  const bodyLength = 4 + 4 + 4 + 2 + 2 + dataLength;
  const body = Buffer.alloc(bodyLength);

  let offset = 0;
  writeUInt32BE(body, entryBytes, offset); offset += 4; // len_entry_bytes
  writeUInt32BE(body, numChannels, offset); offset += 4; // num_channels
  writeUInt32BE(body, numEntries, offset); offset += 4; // len_entries
  writeUInt16BE(body, samplesPerBeat, offset); offset += 2; // samples_per_beat
  writeUInt16BE(body, 0, offset); offset += 2; // unknown
  Buffer.from(data).copy(body, offset); // entries

  const header = createSectionHeader(SectionTags.WAVE_HD, bodyLength);
  return Buffer.concat([header, body]);
}

/**
 * Create a PWVC (vocal_config) section
 */
export function createPWVCSection(options: {
  thresholdLow?: number;
  thresholdMid?: number;
  thresholdHigh?: number;
} = {}): Buffer {
  const thresholdLow = options.thresholdLow ?? 10;
  const thresholdMid = options.thresholdMid ?? 50;
  const thresholdHigh = options.thresholdHigh ?? 90;

  // Body: len_entry_bytes(4) + unknown1(2) + threshold_low(2) + threshold_mid(2) + threshold_high(2)
  const bodyLength = 4 + 2 + 2 + 2 + 2;
  const body = Buffer.alloc(bodyLength);

  let offset = 0;
  writeUInt32BE(body, 8, offset); offset += 4; // len_entry_bytes (size of config)
  writeUInt16BE(body, 0, offset); offset += 2; // unknown1
  writeUInt16BE(body, thresholdLow, offset); offset += 2; // threshold_low
  writeUInt16BE(body, thresholdMid, offset); offset += 2; // threshold_mid
  writeUInt16BE(body, thresholdHigh, offset); // threshold_high

  const header = createSectionHeader(SectionTags.VOCAL_CONFIG, bodyLength);
  return Buffer.concat([header, body]);
}

/**
 * Create a PWV5 (wave_color_scroll) section for HD waveform testing
 */
export function createPWV5Section(options: {
  numEntries?: number;
  data?: Uint8Array;
} = {}): Buffer {
  const numEntries = options.numEntries ?? 1000;
  const entryBytes = 2;
  const dataLength = numEntries * entryBytes;

  const data =
    options.data ?? new Uint8Array(dataLength).fill(0).map((_, i) => i % 256);

  // Body: len_entry_bytes(4) + len_entries(4) + unknown(4) + entries
  const bodyLength = 4 + 4 + 4 + dataLength;
  const body = Buffer.alloc(bodyLength);

  let offset = 0;
  writeUInt32BE(body, entryBytes, offset); offset += 4;
  writeUInt32BE(body, numEntries, offset); offset += 4;
  writeUInt32BE(body, 0x960000, offset); offset += 4; // unknown constant
  Buffer.from(data).copy(body, offset);

  const header = createSectionHeader(SectionTags.WAVE_COLOR_SCROLL, bodyLength);
  return Buffer.concat([header, body]);
}

/**
 * Create a complete ANLZ file with multiple sections
 */
export function createAnlzFile(sections: Buffer[]): Buffer {
  const sectionsBuffer = Buffer.concat(sections);
  const fileLength = 12 + sectionsBuffer.length; // header + sections
  const header = createAnlzHeader(fileLength);
  return Buffer.concat([header, sectionsBuffer]);
}

/**
 * Create a .2EX file with PWV6, PWV7, and PWVC sections
 */
export function create2EXFile(options: {
  pwv6?: Parameters<typeof createPWV6Section>[0];
  pwv7?: Parameters<typeof createPWV7Section>[0];
  pwvc?: Parameters<typeof createPWVCSection>[0];
} = {}): Buffer {
  const sections: Buffer[] = [];

  if (options.pwv6 !== undefined || Object.keys(options).length === 0) {
    sections.push(createPWV6Section(options.pwv6 ?? {}));
  }
  if (options.pwv7 !== undefined || Object.keys(options).length === 0) {
    sections.push(createPWV7Section(options.pwv7 ?? {}));
  }
  if (options.pwvc !== undefined || Object.keys(options).length === 0) {
    sections.push(createPWVCSection(options.pwvc ?? {}));
  }

  return createAnlzFile(sections);
}

/**
 * Create a .EXT file with PWV5 section
 */
export function createEXTFile(options: {
  pwv5?: Parameters<typeof createPWV5Section>[0];
} = {}): Buffer {
  const sections: Buffer[] = [];
  sections.push(createPWV5Section(options.pwv5 ?? {}));
  return createAnlzFile(sections);
}
