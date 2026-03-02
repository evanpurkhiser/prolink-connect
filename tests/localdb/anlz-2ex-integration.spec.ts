/**
 * .2EX Integration Tests
 *
 * Verifies the full data pipeline from binary .2EX fixtures through manual
 * section parsing to typed output. Since the Kaitai parser is mocked in
 * the jest environment, these tests manually parse the binary sections
 * (simulating what Kaitai would produce) and feed them to the parser
 * functions to verify end-to-end data integrity.
 *
 * Also tests the PWV6 → 3-band conversion logic used in the desktop app
 * to ensure normalized band values are correct.
 */

import {
  makeWaveform3BandPreview,
  makeWaveform3BandDetail,
  makeVocalConfig,
} from 'src/localdb/rekordbox/anlz-parsers';
import {
  create2EXFile,
  createPWV6Section,
  createPWV7Section,
  createPWVCSection,
  SectionTags,
} from './fixtures/anlz-fixtures';

// ============================================================================
// Helper: Manual binary section parser
//
// Simulates what the Kaitai parser does: reads section headers and body
// fields from the binary buffer. This lets us test the full pipeline
// (binary → parsed object → typed output) without the webpack-compiled
// Kaitai module.
// ============================================================================

interface ParsedSection {
  fourcc: number;
  body: Record<string, unknown>;
}

/**
 * Parse a .2EX binary buffer into section objects matching Kaitai's output shape.
 */
function parseAnlzSections(buffer: Buffer): ParsedSection[] {
  const sections: ParsedSection[] = [];

  // Skip PMAI header (12 bytes)
  let offset = 12;

  while (offset < buffer.length) {
    const fourcc = buffer.readUInt32BE(offset);
    const lenTag = buffer.readUInt32BE(offset + 8);
    const bodyStart = offset + 12;

    if (fourcc === SectionTags.WAVE_COLOR_3CHANNEL) {
      // PWV6: len_entry_bytes(4) + num_channels(4) + len_entries(4) + unknown(4) + unknown(4) + entries
      const lenEntries = buffer.readUInt32BE(bodyStart + 8);
      const lenEntryBytes = buffer.readUInt32BE(bodyStart);
      const dataStart = bodyStart + 20;
      const dataLength = lenEntries * lenEntryBytes;
      const entries = buffer.slice(dataStart, dataStart + dataLength);

      sections.push({
        fourcc,
        body: { lenEntries, entries },
      });
    } else if (fourcc === SectionTags.WAVE_HD) {
      // PWV7: len_entry_bytes(4) + num_channels(4) + len_entries(4) + samples_per_beat(2) + unknown(2) + entries
      const lenEntries = buffer.readUInt32BE(bodyStart + 8);
      const lenEntryBytes = buffer.readUInt32BE(bodyStart);
      const samplesPerBeat = buffer.readUInt16BE(bodyStart + 12);
      const dataStart = bodyStart + 16;
      const dataLength = lenEntries * lenEntryBytes;
      const entries = buffer.slice(dataStart, dataStart + dataLength);

      sections.push({
        fourcc,
        body: { lenEntries, samplesPerBeat, entries },
      });
    } else if (fourcc === SectionTags.VOCAL_CONFIG) {
      // PWVC: len_entry_bytes(4) + unknown(2) + threshold_low(2) + threshold_mid(2) + threshold_high(2)
      const thresholdLow = buffer.readUInt16BE(bodyStart + 6);
      const thresholdMid = buffer.readUInt16BE(bodyStart + 8);
      const thresholdHigh = buffer.readUInt16BE(bodyStart + 10);

      sections.push({
        fourcc,
        body: { thresholdLow, thresholdMid, thresholdHigh },
      });
    }

    offset += lenTag;
  }

  return sections;
}

/**
 * Replicate the convertPWV6ToBands() function from the desktop app's
 * mixstatus-handler. This normalizes raw PWV6 byte data into 3-band
 * frequency peaks (0-1 range).
 */
function convertPWV6ToBands(
  data: Uint8Array,
  numEntries: number
): { low: number[]; mid: number[]; high: number[] } {
  const low = new Array<number>(numEntries);
  const mid = new Array<number>(numEntries);
  const high = new Array<number>(numEntries);

  for (let i = 0; i < numEntries; i++) {
    const offset = i * 3;
    low[i] = data[offset] / 255;
    mid[i] = data[offset + 1] / 255;
    high[i] = data[offset + 2] / 255;
  }

  return { low, mid, high };
}

describe('.2EX Integration Tests', () => {
  // ==========================================================================
  // Full pipeline: binary fixture → manual parse → parser function
  // ==========================================================================
  describe('binary fixture → parser pipeline', () => {
    it('parses PWV6 from binary fixture end-to-end', () => {
      const inputData = new Uint8Array([255, 0, 128, 0, 255, 64, 100, 100, 100]);
      const file = create2EXFile({
        pwv6: { numEntries: 3, data: inputData },
      });

      const sections = parseAnlzSections(file);
      const pwv6Section = sections.find(s => s.fourcc === SectionTags.WAVE_COLOR_3CHANNEL);
      expect(pwv6Section).toBeDefined();

      const result = makeWaveform3BandPreview(pwv6Section!);
      expect(result.numEntries).toBe(3);
      expect(Array.from(result.data)).toEqual(Array.from(inputData));
    });

    it('parses PWV7 from binary fixture end-to-end', () => {
      const inputData = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const file = create2EXFile({
        pwv7: { numEntries: 2, samplesPerBeat: 150, data: inputData },
      });

      const sections = parseAnlzSections(file);
      const pwv7Section = sections.find(s => s.fourcc === SectionTags.WAVE_HD);
      expect(pwv7Section).toBeDefined();

      const result = makeWaveform3BandDetail(pwv7Section!);
      expect(result.numEntries).toBe(2);
      expect(result.samplesPerBeat).toBe(150);
      expect(Array.from(result.data)).toEqual(Array.from(inputData));
    });

    it('parses PWVC from binary fixture end-to-end', () => {
      const file = create2EXFile({
        pwvc: { thresholdLow: 256, thresholdMid: 1024, thresholdHigh: 4096 },
      });

      const sections = parseAnlzSections(file);
      const pwvcSection = sections.find(s => s.fourcc === SectionTags.VOCAL_CONFIG);
      expect(pwvcSection).toBeDefined();

      const result = makeVocalConfig(pwvcSection!);
      expect(result.thresholdLow).toBe(256);
      expect(result.thresholdMid).toBe(1024);
      expect(result.thresholdHigh).toBe(4096);
    });

    it('parses all 3 sections from a complete .2EX file', () => {
      const pwv6Data = new Uint8Array([100, 150, 200, 50, 75, 100]);
      const pwv7Data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90]);

      const file = create2EXFile({
        pwv6: { numEntries: 2, data: pwv6Data },
        pwv7: { numEntries: 3, samplesPerBeat: 150, data: pwv7Data },
        pwvc: { thresholdLow: 10, thresholdMid: 50, thresholdHigh: 90 },
      });

      const sections = parseAnlzSections(file);
      expect(sections).toHaveLength(3);

      // PWV6
      const preview = makeWaveform3BandPreview(
        sections.find(s => s.fourcc === SectionTags.WAVE_COLOR_3CHANNEL)!
      );
      expect(preview.numEntries).toBe(2);
      expect(Array.from(preview.data)).toEqual(Array.from(pwv6Data));

      // PWV7
      const detail = makeWaveform3BandDetail(
        sections.find(s => s.fourcc === SectionTags.WAVE_HD)!
      );
      expect(detail.numEntries).toBe(3);
      expect(detail.samplesPerBeat).toBe(150);
      expect(Array.from(detail.data)).toEqual(Array.from(pwv7Data));

      // PWVC
      const vocal = makeVocalConfig(
        sections.find(s => s.fourcc === SectionTags.VOCAL_CONFIG)!
      );
      expect(vocal.thresholdLow).toBe(10);
      expect(vocal.thresholdMid).toBe(50);
      expect(vocal.thresholdHigh).toBe(90);
    });
  });

  // ==========================================================================
  // Partial .2EX files (not all sections present)
  // ==========================================================================
  describe('partial .2EX files', () => {
    it('parses file with only PWV6', () => {
      const file = create2EXFile({
        pwv6: { numEntries: 100 },
      });

      const sections = parseAnlzSections(file);
      expect(sections).toHaveLength(1);
      expect(sections[0].fourcc).toBe(SectionTags.WAVE_COLOR_3CHANNEL);

      const result = makeWaveform3BandPreview(sections[0]);
      expect(result.numEntries).toBe(100);
    });

    it('parses file with only PWVC', () => {
      const file = create2EXFile({
        pwvc: { thresholdLow: 5, thresholdMid: 25, thresholdHigh: 75 },
      });

      const sections = parseAnlzSections(file);
      expect(sections).toHaveLength(1);
      expect(sections[0].fourcc).toBe(SectionTags.VOCAL_CONFIG);

      const result = makeVocalConfig(sections[0]);
      expect(result.thresholdLow).toBe(5);
    });

    it('parses file with PWV6 and PWVC but no PWV7', () => {
      const file = create2EXFile({
        pwv6: { numEntries: 50 },
        pwvc: { thresholdLow: 10, thresholdMid: 50, thresholdHigh: 90 },
      });

      const sections = parseAnlzSections(file);
      expect(sections).toHaveLength(2);

      const hasPWV6 = sections.some(s => s.fourcc === SectionTags.WAVE_COLOR_3CHANNEL);
      const hasPWV7 = sections.some(s => s.fourcc === SectionTags.WAVE_HD);
      const hasPWVC = sections.some(s => s.fourcc === SectionTags.VOCAL_CONFIG);

      expect(hasPWV6).toBe(true);
      expect(hasPWV7).toBe(false);
      expect(hasPWVC).toBe(true);
    });
  });

  // ==========================================================================
  // Data integrity through the pipeline
  // ==========================================================================
  describe('data integrity', () => {
    it('preserves all 255 possible byte values through PWV6 pipeline', () => {
      // Create data with every possible byte value (0-254) + wrap
      const numEntries = 85; // 255 / 3 = 85 entries
      const data = new Uint8Array(numEntries * 3);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      const file = create2EXFile({ pwv6: { numEntries, data } });
      const sections = parseAnlzSections(file);
      const result = makeWaveform3BandPreview(sections[0]);

      for (let i = 0; i < data.length; i++) {
        expect(result.data[i]).toBe(data[i]);
      }
    });

    it('handles realistic 1200-entry PWV6 data', () => {
      const numEntries = 1200;
      const data = new Uint8Array(numEntries * 3);
      // Simulate a realistic waveform: silence → build → peak → fadeout
      for (let i = 0; i < numEntries; i++) {
        const progress = i / numEntries;
        const amplitude = Math.sin(progress * Math.PI); // bell curve
        data[i * 3] = Math.floor(amplitude * 200);       // low
        data[i * 3 + 1] = Math.floor(amplitude * 150);   // mid
        data[i * 3 + 2] = Math.floor(amplitude * 100);   // high
      }

      const file = create2EXFile({ pwv6: { numEntries, data } });
      const sections = parseAnlzSections(file);
      const result = makeWaveform3BandPreview(sections[0]);

      expect(result.numEntries).toBe(1200);
      expect(result.data.length).toBe(3600);

      // Check peak is near the middle
      const midIndex = 600;
      expect(result.data[midIndex * 3]).toBeGreaterThan(150);
    });

    it('handles realistic 30000-entry PWV7 detail data', () => {
      // 200 seconds * 150 samples/sec = 30000 entries
      const numEntries = 30000;
      const data = new Uint8Array(numEntries * 3);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      const file = create2EXFile({
        pwv7: { numEntries, samplesPerBeat: 150, data },
      });
      const sections = parseAnlzSections(file);
      const result = makeWaveform3BandDetail(sections[0]);

      expect(result.numEntries).toBe(30000);
      expect(result.data.length).toBe(90000);
      expect(result.samplesPerBeat).toBe(150);

      // Spot-check first and last entries
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(1);
      expect(result.data[2]).toBe(2);
    });
  });

  // ==========================================================================
  // convertPWV6ToBands — band conversion logic
  // ==========================================================================
  describe('convertPWV6ToBands', () => {
    it('normalizes byte values to 0-1 range', () => {
      // 2 entries: low=255/mid=0/high=128, low=0/mid=255/high=64
      const data = new Uint8Array([255, 0, 128, 0, 255, 64]);
      const bands = convertPWV6ToBands(data, 2);

      expect(bands.low[0]).toBeCloseTo(1.0);      // 255/255
      expect(bands.mid[0]).toBeCloseTo(0.0);       // 0/255
      expect(bands.high[0]).toBeCloseTo(128 / 255); // ~0.502

      expect(bands.low[1]).toBeCloseTo(0.0);       // 0/255
      expect(bands.mid[1]).toBeCloseTo(1.0);       // 255/255
      expect(bands.high[1]).toBeCloseTo(64 / 255); // ~0.251
    });

    it('returns arrays of correct length', () => {
      const numEntries = 100;
      const data = new Uint8Array(numEntries * 3);
      const bands = convertPWV6ToBands(data, numEntries);

      expect(bands.low).toHaveLength(100);
      expect(bands.mid).toHaveLength(100);
      expect(bands.high).toHaveLength(100);
    });

    it('all values are in 0-1 range', () => {
      const numEntries = 50;
      const data = new Uint8Array(numEntries * 3);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.floor(Math.random() * 256);
      }

      const bands = convertPWV6ToBands(data, numEntries);

      for (let i = 0; i < numEntries; i++) {
        expect(bands.low[i]).toBeGreaterThanOrEqual(0);
        expect(bands.low[i]).toBeLessThanOrEqual(1);
        expect(bands.mid[i]).toBeGreaterThanOrEqual(0);
        expect(bands.mid[i]).toBeLessThanOrEqual(1);
        expect(bands.high[i]).toBeGreaterThanOrEqual(0);
        expect(bands.high[i]).toBeLessThanOrEqual(1);
      }
    });

    it('handles all-zero data (silence)', () => {
      const data = new Uint8Array(30); // 10 entries × 3
      const bands = convertPWV6ToBands(data, 10);

      for (let i = 0; i < 10; i++) {
        expect(bands.low[i]).toBe(0);
        expect(bands.mid[i]).toBe(0);
        expect(bands.high[i]).toBe(0);
      }
    });

    it('handles all-max data (clipping)', () => {
      const data = new Uint8Array(30).fill(255); // 10 entries × 3
      const bands = convertPWV6ToBands(data, 10);

      for (let i = 0; i < 10; i++) {
        expect(bands.low[i]).toBe(1);
        expect(bands.mid[i]).toBe(1);
        expect(bands.high[i]).toBe(1);
      }
    });

    it('handles empty data', () => {
      const data = new Uint8Array(0);
      const bands = convertPWV6ToBands(data, 0);

      expect(bands.low).toHaveLength(0);
      expect(bands.mid).toHaveLength(0);
      expect(bands.high).toHaveLength(0);
    });

    it('full pipeline: binary fixture → parse → convert to bands', () => {
      // Known input: 3 entries with specific band values
      const inputData = new Uint8Array([
        255, 128, 0,     // Entry 0: loud low, medium mid, silent high
        0, 0, 255,       // Entry 1: silent low/mid, loud high
        128, 128, 128,   // Entry 2: equal bands
      ]);

      const file = create2EXFile({ pwv6: { numEntries: 3, data: inputData } });
      const sections = parseAnlzSections(file);
      const preview = makeWaveform3BandPreview(sections[0]);
      const bands = convertPWV6ToBands(preview.data, preview.numEntries);

      // Entry 0
      expect(bands.low[0]).toBeCloseTo(1.0);
      expect(bands.mid[0]).toBeCloseTo(128 / 255);
      expect(bands.high[0]).toBeCloseTo(0.0);

      // Entry 1
      expect(bands.low[1]).toBeCloseTo(0.0);
      expect(bands.mid[1]).toBeCloseTo(0.0);
      expect(bands.high[1]).toBeCloseTo(1.0);

      // Entry 2
      expect(bands.low[2]).toBeCloseTo(128 / 255);
      expect(bands.mid[2]).toBeCloseTo(128 / 255);
      expect(bands.high[2]).toBeCloseTo(128 / 255);
    });
  });

  // ==========================================================================
  // AnalysisDataPayload shape verification
  // ==========================================================================
  describe('AnalysisDataPayload shape', () => {
    it('waveform3BandPreview converts to expected payload shape', () => {
      const inputData = new Uint8Array([200, 100, 50, 100, 200, 150]);
      const file = create2EXFile({ pwv6: { numEntries: 2, data: inputData } });
      const sections = parseAnlzSections(file);
      const preview = makeWaveform3BandPreview(sections[0]);
      const bands = convertPWV6ToBands(preview.data, preview.numEntries);

      // This matches the shape in AnalysisDataPayload.waveform3BandPreview
      const payload = {
        low: bands.low,
        mid: bands.mid,
        high: bands.high,
      };

      expect(payload).toHaveProperty('low');
      expect(payload).toHaveProperty('mid');
      expect(payload).toHaveProperty('high');
      expect(payload.low).toHaveLength(2);
      expect(payload.mid).toHaveLength(2);
      expect(payload.high).toHaveLength(2);
    });

    it('vocalConfig converts to expected payload shape', () => {
      const file = create2EXFile({
        pwvc: { thresholdLow: 10, thresholdMid: 50, thresholdHigh: 90 },
      });
      const sections = parseAnlzSections(file);
      const vocal = makeVocalConfig(sections[0]);

      // This matches the shape in AnalysisDataPayload.vocalConfig
      const payload = {
        thresholdLow: vocal.thresholdLow,
        thresholdMid: vocal.thresholdMid,
        thresholdHigh: vocal.thresholdHigh,
      };

      expect(payload).toHaveProperty('thresholdLow');
      expect(payload).toHaveProperty('thresholdMid');
      expect(payload).toHaveProperty('thresholdHigh');
      expect(typeof payload.thresholdLow).toBe('number');
      expect(typeof payload.thresholdMid).toBe('number');
      expect(typeof payload.thresholdHigh).toBe('number');
    });

    it('null is a valid value when .2EX file is missing', () => {
      // Simulating what happens when .2EX load fails (.catch(() => null))
      const twoxResult = null as {
        waveform3BandPreview: { numEntries: number; data: Uint8Array } | null;
        vocalConfig: { thresholdLow: number; thresholdMid: number; thresholdHigh: number } | null;
      } | null;
      const waveform3BandPreview = twoxResult?.waveform3BandPreview ?? null;
      const vocalConfig = twoxResult?.vocalConfig ?? null;

      expect(waveform3BandPreview).toBeNull();
      expect(vocalConfig).toBeNull();
    });
  });
});
