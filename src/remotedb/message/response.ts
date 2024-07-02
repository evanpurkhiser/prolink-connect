import {makeCueLoopEntry} from 'src/localdb/utils';
import {Field} from 'src/remotedb/fields';
import {fieldsToItem} from 'src/remotedb/message/item';
import {Response} from 'src/remotedb/message/types';
import {
  BeatGrid,
  CueAndLoop,
  HotcueButton,
  WaveformDetailed,
  WaveformHD,
  WaveformPreview,
} from 'src/types';
import {
  convertWaveformHDData,
  extractBitMask,
  extractColor,
  makeOffsetArray,
} from 'src/utils/converters';

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

  // Every byte represents one segment of the waveform, and there are 150
  // segments per second of audio. (These seem to correspond to 'half frames'
  // following the seconds in the player display.) Each byte encodes both a
  // color and height.
  //
  // |  7  6  5  |  4  3  2  1  0 |
  // [ whiteness |     height     ]
  const whitenessMask = 0b11100000; // prettier-ignore
  const heightMask    = 0b00011111; // prettier-ignore

  return Array.from(data).map(b => ({
    height: extractBitMask(b, heightMask),
    whiteness: extractColor(b, whitenessMask),
  }));
};

/**
 * Converts HD waveform data.
 */
const convertWaveformHD = (args: Field[]): WaveformHD => {
  // TODO: Verify this 0x34 offset is correct
  const WAVEFORM_START = 0x34;
  const data = (args[3].value as Buffer).slice(WAVEFORM_START);

  // TODO: This response is also used for the HD waveform previews, however
  // those have a much more complex data structure.

  return convertWaveformHDData(data);
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

      const offsetInFrames = entry.readUInt32LE(0x0c);
      const lengthInFrames = entry.readUInt32LE(0x10) - offsetInFrames;

      // NOTE: The offset and length are reported as 1/150th second increments.
      //       We convert these to milliseconds here.
      const offset = (offsetInFrames / 150) * 1000;
      const length = (lengthInFrames / 150) * 1000;

      return makeCueLoopEntry(isCue, isLoop, offset, length, button);
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

      const offsetInFrames = entry.readUInt32LE(0x0c);
      const lengthInFrames = entry.readUInt32LE(0x10) - offsetInFrames;

      // NOTE: The offset and length are reported as 1/150th second increments.
      //       We convert these to milliseconds here.
      const offset = (offsetInFrames / 150) * 1000;
      const length = (lengthInFrames / 150) * 1000;

      const basicEntry = makeCueLoopEntry(isCue, isLoop, offset, length, button);

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
  [Response.CueAndLoop]: convertCueAndLoops,
  [Response.WaveformPreview]: convertWaveformPreview,
  [Response.WaveformDetailed]: convertWaveformDetailed,
  [Response.WaveformHD]: convertWaveformHD,
  [Response.AdvCueAndLoops]: convertAdvCueAndLoops,
} as const;
