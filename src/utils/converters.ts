import {WaveformHD} from 'src/types';

/**
 * Extracts a specific bitmask, shifting it to the bitmask.
 */
export const extractBitMask = (val: number, mask: number): number =>
  (val & mask) >> Math.log2(mask & -mask);

/**
 * Pioneer colors are 3 bits, convert this to a percentage.
 */
export const extractColor = (val: number, mask: number): number =>
  extractBitMask(val, mask) / 0b111;

/**
 * Utility to generate an filled with byte offsets for each segment
 */
export const makeOffsetArray = (byteLength: number, segmentSize: number) =>
  new Array(byteLength / segmentSize).fill(null).map((_, i) => i * segmentSize);

/**
 * Convert raw waveform HD data into the structured WaveformHD type
 */
export const convertWaveformHDData = (data: Buffer): WaveformHD => {
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
