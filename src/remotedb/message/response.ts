import {Response} from 'src/remotedb/message/types';
import {Field} from 'src/remotedb/fields';
import {fieldsToItem} from 'src/remotedb/message/item';
import {
  BeatGrid,
  WaveformDetailed,
  WaveformPreview,
  WaveformHD,
  CuePoint,
  Loop,
  Hotcue,
  HotLoop,
  HotcueButton,
} from 'src/types';

/**
 * Extracts a specific bitmask, shifting it to the bitmask.
 */
const extractBitMask = (val: number, mask: number): number =>
  (val & mask) >> Math.log2(mask & -mask);

/**
 * Pioneer colors are 3 bits, convert this to a percentage.
 */
const extractColor = (val: number, mask: number): number =>
  extractBitMask(val, mask) / 0b111;

/**
 * Utility to generate an filled with byte offsets for each segment
 */
function makeOffsetArray(byteLength: number, segmentSize: number) {
  return new Array(byteLength / segmentSize).fill(null).map((_, i) => i * segmentSize);
}

type CueAndLoop = CuePoint | Loop | Hotcue | HotLoop;

const makeCueLoopEntry = (
  isCue: boolean,
  isLoop: boolean,
  frameOffset: number,
  length: number,
  button: false | HotcueButton
): null | CueAndLoop =>
  button !== false
    ? isLoop
      ? {type: 'hot_loop', frameOffset, length, button}
      : {type: 'hot_cue', frameOffset, button}
    : isLoop
    ? {type: 'loop', frameOffset, length}
    : isCue
    ? {type: 'cue_point', frameOffset}
    : null;

/**
 * Generic null converter, for responses with no data.
 */
const nullConverter = (_args: Field[]) => null;

/**
 * Converts setup success messages, which primarily includes the number of
 * items available upon the next request.
 */
const convertSuccess = (args: Field[]) => ({
  itemsAvailable: args[1].value as number,
});

/**
 * Converts artwork to a buffer. Will be mempty for empty artwork
 */
const convertArtwork = (args: Field[]) => args[3].value as Buffer;

/**
 * Converts the beat grid binary response to a BeatGrid array.
 */
const convertBeatGrid = (args: Field[]): BeatGrid => {
  const BEATGRID_START = 0x14;
  const data = (args[3].value as Buffer).slice(BEATGRID_START);

  type Count = BeatGrid[number]['count'];

  return makeOffsetArray(data.length, 0x10).map(byteOffset => ({
    offset: data.readUInt32LE(byteOffset + 4),
    bpm: data.readUInt16LE(byteOffset + 2) / 100,
    count: data[byteOffset] as Count,
  }));
};

/**
 * Converts preview waveform data
 */
const convertWaveformPreview = (args: Field[]): WaveformPreview => {
  const data = args[3].value as Buffer;

  // TODO: The last 100 bytes in the data array is a tiny waveform preview
  const PREVIEW_DATA_LEN = 800;

  return makeOffsetArray(PREVIEW_DATA_LEN, 0x02).map(byteOffset => ({
    height: data[byteOffset],
    whiteness: data[byteOffset + 1] / 7,
  }));
};

/**
 * Converts detailed waveform data.
 */
const convertWaveformDetailed = (args: Field[]): WaveformDetailed => {
  const data = args[3].value as Buffer;

  // Every byte reperesents one segment of the waveform, and there are 150
  // segments per second of audio. (These seem to correspond to 'half frames'
  // following the seconds in the player display.) Each byte encodes both a
  // color and height.
  //
  // |  7  6  5  |  4  3  2  1  0 |
  // [ whiteness |     height     ]
  const whitenessMask = 0b11100000; //prettier-ignore
  const heightMask    = 0b00011111; //prettier-ignore

  return Array.from(data).map(b => ({
    height: extractBitMask(b, heightMask),
    whiteness: extractColor(b, whitenessMask),
  }));
};

/**
 * Converts HD waveform data.
 */
const convertWaveformHD = (args: Field[]): WaveformHD => {
  const WAVEFORM_START = 0x34;
  const data = (args[3].value as Buffer).slice(WAVEFORM_START);

  // TODO: This response is also used for the HD waveform previews, however
  // those tend to have a much more complex data structure.

  // Two byte bit representation for the color waveform.
  //
  // | f  e  d | c  b  a | 9  8  7 | 6  5  4  3  2 | 1   0 |
  // [   red   |  green  |   blue  |     height    | ~ | ~ ]
  const redMask    = 0b11100000_00000000; // prettier-ignore
  const greenMask  = 0b00011100_00000000; // prettier-ignore
  const blueMask   = 0b00000011_10000000; // prettier-ignore
  const heightMask = 0b00000000_01111100; // prettier-ignore

  const ec = extractColor;

  return makeOffsetArray(data.length, 0x02)
    .map(byteOffset => data.readUInt16BE(byteOffset))
    .map(v => ({
      height: extractBitMask(v, heightMask),
      color: [ec(v, redMask), ec(v, greenMask), ec(v, blueMask)],
    }));
};

/**
 * Converts old-style cue / loop / hotcue / hotloop data.
 */
const convertCueAndLoops = (args: Field[]): CueAndLoop[] => {
  const data = args[3].value as Buffer;

  return makeOffsetArray(data.length, 0x24)
    .map(byteOffset => {
      const entry = data.slice(byteOffset, byteOffset + 0x24);

      const isLoop = !!entry[0];
      const isCue = !!entry[1];
      const button = entry[2] === 0 ? false : (entry[2] as HotcueButton);

      const frameOffset = entry.readUInt32LE(0x0c);
      const length = entry.readUInt32LE(0x10) - frameOffset;

      return makeCueLoopEntry(isCue, isLoop, frameOffset, length, button);
    })
    .filter((c): c is CueAndLoop => c !== null);
};

/**
 * Converts new-style cue / loop / hotcue / hotloop data, including labels and
 * colors.
 */
const convertAdvCueAndLoops = (args: Field[]): CueAndLoop[] => {
  const data = args[3].value as Buffer;
  const entries = [];

  for (let offset = 0; offset < data.length; ) {
    const length = data.readUInt32LE(offset);
    entries.push(data.slice(offset, offset + length));
    offset += length;
  }

  return entries
    .map(entry => {
      // Deleted cue point
      if (entry[6] === 0x00) {
        return null;
      }

      // The layout here is minorly different from the basic cue and loops,
      // so we unfortunately cannot reuse that logic.
      const button = entry[4] === 0 ? false : (entry[4] as HotcueButton);
      const isCue = entry[6] === 0x01;
      const isLoop = entry[6] === 0x02;

      const frameOffset = entry.readUInt32LE(0x0c);
      const length = entry.readUInt32LE(0x10) - frameOffset;

      const basicEntry = makeCueLoopEntry(isCue, isLoop, frameOffset, length, button);

      // It seems the label may not always be included, if the entry is only 0x38
      // bytes long, exclude color and comment
      if (entry.length === 0x38) {
        return basicEntry;
      }

      const labelByteLength = entry.readUInt16LE(0x48);
      const label = entry
        .slice(0x4a, 0x4a + labelByteLength)
        .slice(0, -2)
        .toString('utf16le');

      const color = entry[0x4a + labelByteLength + 0x04];

      return {...basicEntry, color, label};
    })
    .filter((c): c is CueAndLoop => c !== null);
};

export const responseTransform = {
  [Response.Success]: convertSuccess,
  [Response.Error]: nullConverter,
  [Response.MenuHeader]: nullConverter,
  [Response.MenuFooter]: nullConverter,

  [Response.MenuItem]: fieldsToItem,
  [Response.Artwork]: convertArtwork,
  [Response.BeatGrid]: convertBeatGrid,
  [Response.CueAndLoops]: convertCueAndLoops,
  [Response.WaveformPreview]: convertWaveformPreview,
  [Response.WaveformDetailed]: convertWaveformDetailed,
  [Response.WaveformHD]: convertWaveformHD,
  [Response.AdvCueAndLoops]: convertAdvCueAndLoops,
} as const;
