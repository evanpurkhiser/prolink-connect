import {Response} from 'src/remotedb/message/types';
import {Field} from 'src/remotedb/fields';
import {fieldsToItem} from 'src/remotedb/message/item';
import {BeatGrid, WaveformDetailed, WaveformPreview, WaveformHD} from 'src/types';

/**
 * Extracts a specific bitmask, shifting it to the bitmask.
 */
const extract = (val: number, mask: number): number =>
  (val & mask) >> Math.log2(mask & -mask);

/**
 * Pioneer colors are 3 bits, convert this to a percentage.
 */
const extractColor = (val: number, mask: number): number => extract(val, mask) / 0b111;

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

  return new Array(data.length / 0x10)
    .fill(null)
    .map((_, i) => i * 0x10)
    .map(byteOffset => ({
      offset: data.readUInt32LE(byteOffset + 1),
      count: data[byteOffset] as Count,
    }));
};

/**
 * Converts preview waveform data
 */
const convertWaveformPreview = (args: Field[]): WaveformPreview => {
  const data = args[3].value as Buffer;

  const PREVIEW_WIDTH = 400;

  return new Array(PREVIEW_WIDTH)
    .fill(null)
    .map((_, i) => i * 2)
    .map(byteOffset => ({
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
  // color and height. The three high-order bits encode the color, ranging from
  // darkest blue at 0 to near-white at 7. The five low-order bits encode the
  // height of the waveform at that point, from 0 to 31 pixels.
  //
  // |  7  6  5  |  4  3  2  1  0 |
  // [ whiteness |     height     ]
  const whitenessMask = 0b11100000; //prettier-ignore
  const heightMask    = 0b00011111; //prettier-ignore

  return Array.from(data).map(b => ({
    height: extract(b, heightMask),
    whiteness: extractColor(b, whitenessMask),
  }));
};

/**
 * Converts HD waveform data.
 */
const convertWaveformHD = (args: Field[]): WaveformHD => {
  const WAVEFORM_START = 0x34;
  const data = (args[3].value as Buffer).slice(WAVEFORM_START);

  // two byte bit representation
  //
  // | f  e  d | c  b  a | 9  8  7 | 6  5  4  3  2 | 1   0 |
  // [   red   |  green  |   blue  |     height    | ~ | ~ ]
  const redMask    = 0b11100000_00000000; // prettier-ignore
  const greenMask  = 0b00011100_00000000; // prettier-ignore
  const blueMask   = 0b00000011_10000000; // prettier-ignore
  const heightMask = 0b00000011_01111100; // prettier-ignore

  const ec = extractColor;

  return new Array(data.length / 2)
    .fill(null)
    .map((_, i) => i * 2)
    .map(byteOffset => data.readUInt16LE(byteOffset))
    .map(v => ({
      height: extract(v, heightMask),
      color: [ec(v, redMask), ec(v, greenMask), ec(v, blueMask)],
    }));
};

export const responseTransform = {
  [Response.Success]: convertSuccess,
  [Response.Error]: nullConverter,
  [Response.MenuHeader]: nullConverter,
  [Response.MenuFooter]: nullConverter,
  [Response.MenuItem]: fieldsToItem,
  [Response.Artwork]: convertArtwork,
  [Response.BeatGrid]: convertBeatGrid,
  [Response.CueAndLoops]: nullConverter,
  [Response.WaveformPreview]: convertWaveformPreview,
  [Response.WaveformDetailed]: convertWaveformDetailed,
  [Response.WaveformHD]: convertWaveformHD,
  [Response.AdvCueAndLoops]: nullConverter,
} as const;
