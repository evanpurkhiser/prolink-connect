/**
 * .2EX Parser Unit Tests
 *
 * Tests the parser functions that transform Kaitai-parsed .2EX section objects
 * into typed TypeScript interfaces: Waveform3BandPreview, Waveform3BandDetail,
 * and VocalConfig.
 */

import {
  makeWaveform3BandPreview,
  makeWaveform3BandDetail,
  makeVocalConfig,
} from 'src/localdb/rekordbox/anlz-parsers';

describe('.2EX Parser Functions', () => {
  // ==========================================================================
  // makeWaveform3BandPreview (PWV6)
  // ==========================================================================
  describe('makeWaveform3BandPreview', () => {
    it('extracts numEntries from Kaitai object', () => {
      const kaitaiSection = {
        body: {
          lenEntries: 1200,
          entries: new Uint8Array(1200 * 3),
        },
      };

      const result = makeWaveform3BandPreview(kaitaiSection);
      expect(result.numEntries).toBe(1200);
    });

    it('extracts data as Uint8Array', () => {
      const entries = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const kaitaiSection = {
        body: {
          lenEntries: 2,
          entries,
        },
      };

      const result = makeWaveform3BandPreview(kaitaiSection);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBe(6);
    });

    it('preserves exact byte values in data', () => {
      // 3 entries: low=255/mid=0/high=128, low=0/mid=255/high=64, low=100/mid=100/high=100
      const entries = new Uint8Array([255, 0, 128, 0, 255, 64, 100, 100, 100]);
      const kaitaiSection = {
        body: {
          lenEntries: 3,
          entries,
        },
      };

      const result = makeWaveform3BandPreview(kaitaiSection);

      // Entry 1
      expect(result.data[0]).toBe(255); // low
      expect(result.data[1]).toBe(0);   // mid
      expect(result.data[2]).toBe(128); // high

      // Entry 2
      expect(result.data[3]).toBe(0);   // low
      expect(result.data[4]).toBe(255); // mid
      expect(result.data[5]).toBe(64);  // high

      // Entry 3
      expect(result.data[6]).toBe(100);
      expect(result.data[7]).toBe(100);
      expect(result.data[8]).toBe(100);
    });

    it('handles typical 1200-entry preview', () => {
      const numEntries = 1200;
      const entries = new Uint8Array(numEntries * 3);
      for (let i = 0; i < entries.length; i++) {
        entries[i] = i % 256;
      }

      const kaitaiSection = {
        body: { lenEntries: numEntries, entries },
      };

      const result = makeWaveform3BandPreview(kaitaiSection);
      expect(result.numEntries).toBe(1200);
      expect(result.data.length).toBe(3600);
    });

    it('handles zero entries', () => {
      const kaitaiSection = {
        body: {
          lenEntries: 0,
          entries: new Uint8Array(0),
        },
      };

      const result = makeWaveform3BandPreview(kaitaiSection);
      expect(result.numEntries).toBe(0);
      expect(result.data.length).toBe(0);
    });

    it('handles single entry', () => {
      const kaitaiSection = {
        body: {
          lenEntries: 1,
          entries: new Uint8Array([42, 84, 168]),
        },
      };

      const result = makeWaveform3BandPreview(kaitaiSection);
      expect(result.numEntries).toBe(1);
      expect(result.data[0]).toBe(42);
      expect(result.data[1]).toBe(84);
      expect(result.data[2]).toBe(168);
    });

    it('creates an independent copy of the data', () => {
      const entries = new Uint8Array([10, 20, 30]);
      const kaitaiSection = {
        body: { lenEntries: 1, entries },
      };

      const result = makeWaveform3BandPreview(kaitaiSection);

      // Mutating the source should not affect the result
      entries[0] = 99;
      expect(result.data[0]).toBe(10);
    });
  });

  // ==========================================================================
  // makeWaveform3BandDetail (PWV7)
  // ==========================================================================
  describe('makeWaveform3BandDetail', () => {
    it('extracts numEntries from Kaitai object', () => {
      const kaitaiSection = {
        body: {
          lenEntries: 45000,
          entries: new Uint8Array(45000 * 3),
        },
      };

      const result = makeWaveform3BandDetail(kaitaiSection);
      expect(result.numEntries).toBe(45000);
    });

    it('extracts data as Uint8Array', () => {
      const entries = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const kaitaiSection = {
        body: {
          lenEntries: 2,
          entries,
        },
      };

      const result = makeWaveform3BandDetail(kaitaiSection);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBe(6);
    });

    it('preserves exact byte values in data', () => {
      const entries = new Uint8Array([0, 128, 255, 64, 192, 32]);
      const kaitaiSection = {
        body: {
          lenEntries: 2,
          entries,
        },
      };

      const result = makeWaveform3BandDetail(kaitaiSection);
      expect(Array.from(result.data)).toEqual([0, 128, 255, 64, 192, 32]);
    });

    it('handles large detail waveform (5-min track)', () => {
      const numEntries = 45000;
      const entries = new Uint8Array(numEntries * 3);
      for (let i = 0; i < entries.length; i++) {
        entries[i] = i % 256;
      }

      const kaitaiSection = {
        body: { lenEntries: numEntries, entries },
      };

      const result = makeWaveform3BandDetail(kaitaiSection);
      expect(result.numEntries).toBe(45000);
      expect(result.data.length).toBe(135000);
    });

    it('handles zero entries', () => {
      const kaitaiSection = {
        body: {
          lenEntries: 0,
          entries: new Uint8Array(0),
        },
      };

      const result = makeWaveform3BandDetail(kaitaiSection);
      expect(result.numEntries).toBe(0);
      expect(result.data.length).toBe(0);
    });

    it('creates an independent copy of the data', () => {
      const entries = new Uint8Array([10, 20, 30]);
      const kaitaiSection = {
        body: { lenEntries: 1, entries },
      };

      const result = makeWaveform3BandDetail(kaitaiSection);

      // Mutating the source should not affect the result
      entries[0] = 99;
      expect(result.data[0]).toBe(10);
    });
  });

  // ==========================================================================
  // makeVocalConfig (PWVC)
  // ==========================================================================
  describe('makeVocalConfig', () => {
    it('extracts all three threshold values', () => {
      const kaitaiSection = {
        body: {
          thresholdLow: 10,
          thresholdMid: 50,
          thresholdHigh: 90,
        },
      };

      const result = makeVocalConfig(kaitaiSection);
      expect(result.thresholdLow).toBe(10);
      expect(result.thresholdMid).toBe(50);
      expect(result.thresholdHigh).toBe(90);
    });

    it('handles zero thresholds', () => {
      const kaitaiSection = {
        body: {
          thresholdLow: 0,
          thresholdMid: 0,
          thresholdHigh: 0,
        },
      };

      const result = makeVocalConfig(kaitaiSection);
      expect(result.thresholdLow).toBe(0);
      expect(result.thresholdMid).toBe(0);
      expect(result.thresholdHigh).toBe(0);
    });

    it('handles maximum observed threshold values', () => {
      const kaitaiSection = {
        body: {
          thresholdLow: 114,
          thresholdMid: 146,
          thresholdHigh: 159,
        },
      };

      const result = makeVocalConfig(kaitaiSection);
      expect(result.thresholdLow).toBe(114);
      expect(result.thresholdMid).toBe(146);
      expect(result.thresholdHigh).toBe(159);
    });

    it('handles typical real-world threshold values', () => {
      // Values observed in 192 real .2EX files from rekordbox USB sticks
      const kaitaiSection = {
        body: {
          thresholdLow: 97,
          thresholdMid: 114,
          thresholdHigh: 130,
        },
      };

      const result = makeVocalConfig(kaitaiSection);
      expect(result.thresholdLow).toBe(97);
      expect(result.thresholdMid).toBe(114);
      expect(result.thresholdHigh).toBe(130);
    });

    it('returns a plain object with exactly 3 properties', () => {
      const kaitaiSection = {
        body: {
          thresholdLow: 10,
          thresholdMid: 50,
          thresholdHigh: 90,
        },
      };

      const result = makeVocalConfig(kaitaiSection);
      expect(Object.keys(result)).toHaveLength(3);
      expect(Object.keys(result).sort()).toEqual([
        'thresholdHigh',
        'thresholdLow',
        'thresholdMid',
      ]);
    });
  });
});
