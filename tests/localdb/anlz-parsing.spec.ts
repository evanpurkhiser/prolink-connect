/**
 * ANLZ Binary Fixture Tests
 *
 * Tests the binary fixture creation functions to verify they create
 * correctly structured ANLZ files. These tests validate the binary
 * format without requiring the Kaitai parser.
 */

import {
  create2EXFile,
  createAnlzFile,
  createEXTFile,
  createPWV5Section,
  createPWV6Section,
  createPWV7Section,
  createPWVCSection,
  SectionTags,
} from './fixtures/anlz-fixtures';

describe('ANLZ Binary Fixtures', () => {
  // ==========================================================================
  // File Header Tests
  // ==========================================================================
  describe('file header', () => {
    it('creates valid ANLZ file header', () => {
      const buffer = createAnlzFile([]);

      // Header should be 12 bytes
      expect(buffer.length).toBe(12);

      // Magic bytes: "PMAI"
      expect(buffer.toString('ascii', 0, 4)).toBe('PMAI');

      // Header length: 12
      expect(buffer.readUInt32BE(4)).toBe(12);

      // File length: 12 (header only when no sections)
      expect(buffer.readUInt32BE(8)).toBe(12);
    });

    it('calculates file length correctly with sections', () => {
      const pwv6 = createPWV6Section({numEntries: 10});
      const buffer = createAnlzFile([pwv6]);

      const expectedLength = 12 + pwv6.length; // header + section
      expect(buffer.readUInt32BE(8)).toBe(expectedLength);
      expect(buffer.length).toBe(expectedLength);
    });
  });

  // ==========================================================================
  // PWV6 Section Tests (wave_color_3channel)
  // ==========================================================================
  describe('PWV6 section', () => {
    it('creates valid section header', () => {
      const section = createPWV6Section({numEntries: 100});

      // Section tag
      expect(section.readUInt32BE(0)).toBe(SectionTags.WAVE_COLOR_3CHANNEL);

      // Header length (always 12)
      expect(section.readUInt32BE(4)).toBe(12);

      // Tag length includes header + body
      const bodyLength = 4 + 4 + 100 * 3; // len_entry_bytes + len_entries + data
      expect(section.readUInt32BE(8)).toBe(12 + bodyLength);
    });

    it('stores entry bytes correctly', () => {
      const section = createPWV6Section({numEntries: 100});

      // len_entry_bytes at offset 12 (after header)
      expect(section.readUInt32BE(12)).toBe(3); // 3 bytes per RGB entry
    });

    it('stores num_entries correctly', () => {
      const section = createPWV6Section({numEntries: 500});

      // len_entries at offset 16
      expect(section.readUInt32BE(16)).toBe(500);
    });

    it('stores waveform data correctly', () => {
      const data = new Uint8Array([255, 0, 128, 0, 255, 64, 100, 100, 100]);
      const section = createPWV6Section({numEntries: 3, data});

      // Data starts at offset 20 (12 header + 8 body fields)
      const extractedData = section.slice(20, 20 + 9);
      expect(Array.from(extractedData)).toEqual(Array.from(data));
    });

    it('generates default data when not provided', () => {
      const section = createPWV6Section({numEntries: 10});

      // Data should be numEntries * 3 bytes
      const expectedDataLength = 10 * 3;
      const totalLength = 12 + 8 + expectedDataLength; // header + body fields + data
      expect(section.length).toBe(totalLength);
    });
  });

  // ==========================================================================
  // PWV7 Section Tests (wave_hd)
  // ==========================================================================
  describe('PWV7 section', () => {
    it('creates valid section header', () => {
      const section = createPWV7Section({numEntries: 1000});

      // Section tag
      expect(section.readUInt32BE(0)).toBe(SectionTags.WAVE_HD);

      // Header length (always 12)
      expect(section.readUInt32BE(4)).toBe(12);
    });

    it('stores entry bytes correctly', () => {
      const section = createPWV7Section({});

      // len_entry_bytes at offset 12
      expect(section.readUInt32BE(12)).toBe(3); // 3 bytes per RGB entry
    });

    it('stores num_entries correctly', () => {
      const section = createPWV7Section({numEntries: 30000});

      // len_entries at offset 16
      expect(section.readUInt32BE(16)).toBe(30000);
    });

    it('stores waveform data correctly', () => {
      const data = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const section = createPWV7Section({numEntries: 2, data});

      // Data starts at offset 24 (12 header + 12 body fields)
      const extractedData = section.slice(24, 24 + 6);
      expect(Array.from(extractedData)).toEqual(Array.from(data));
    });
  });

  // ==========================================================================
  // PWVC Section Tests (vocal_config)
  // ==========================================================================
  describe('PWVC section', () => {
    it('creates valid section header', () => {
      const section = createPWVCSection({});

      // Section tag
      expect(section.readUInt32BE(0)).toBe(SectionTags.VOCAL_CONFIG);

      // Header length (always 12)
      expect(section.readUInt32BE(4)).toBe(12);

      // Tag length: 12 header + 8 body
      expect(section.readUInt32BE(8)).toBe(20);
    });

    it('stores threshold_low correctly', () => {
      const section = createPWVCSection({thresholdLow: 15});

      // threshold_low at offset 14 (12 header + 2 unknown)
      expect(section.readUInt16BE(14)).toBe(15);
    });

    it('stores threshold_mid correctly', () => {
      const section = createPWVCSection({thresholdMid: 55});

      // threshold_mid at offset 16
      expect(section.readUInt16BE(16)).toBe(55);
    });

    it('stores threshold_high correctly', () => {
      const section = createPWVCSection({thresholdHigh: 95});

      // threshold_high at offset 18
      expect(section.readUInt16BE(18)).toBe(95);
    });

    it('handles zero thresholds', () => {
      const section = createPWVCSection({
        thresholdLow: 0,
        thresholdMid: 0,
        thresholdHigh: 0,
      });

      expect(section.readUInt16BE(14)).toBe(0);
      expect(section.readUInt16BE(16)).toBe(0);
      expect(section.readUInt16BE(18)).toBe(0);
    });

    it('handles max observed thresholds', () => {
      const section = createPWVCSection({
        thresholdLow: 114,
        thresholdMid: 146,
        thresholdHigh: 159,
      });

      expect(section.readUInt16BE(14)).toBe(114);
      expect(section.readUInt16BE(16)).toBe(146);
      expect(section.readUInt16BE(18)).toBe(159);
    });
  });

  // ==========================================================================
  // PWV5 Section Tests (wave_color_scroll)
  // ==========================================================================
  describe('PWV5 section', () => {
    it('creates valid section header', () => {
      const section = createPWV5Section({numEntries: 1000});

      // Section tag
      expect(section.readUInt32BE(0)).toBe(SectionTags.WAVE_COLOR_SCROLL);

      // Header length (always 12)
      expect(section.readUInt32BE(4)).toBe(12);
    });

    it('stores entry bytes correctly', () => {
      const section = createPWV5Section({});

      // len_entry_bytes at offset 12
      expect(section.readUInt32BE(12)).toBe(2); // 2 bytes per entry
    });

    it('stores num_entries correctly', () => {
      const section = createPWV5Section({numEntries: 2000});

      // len_entries at offset 16
      expect(section.readUInt32BE(16)).toBe(2000);
    });

    it('stores waveform data correctly', () => {
      const data = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const section = createPWV5Section({numEntries: 2, data});

      // Data starts at offset 24 (12 header + 12 body fields)
      const extractedData = section.slice(24, 24 + 4);
      expect(Array.from(extractedData)).toEqual(Array.from(data));
    });
  });

  // ==========================================================================
  // Combined File Tests
  // ==========================================================================
  describe('combined files', () => {
    it('creates valid 2EX file with all sections', () => {
      const buffer = create2EXFile({
        pwv6: {numEntries: 100},
        pwv7: {numEntries: 500},
        pwvc: {thresholdLow: 10, thresholdMid: 50, thresholdHigh: 90},
      });

      // Check header
      expect(buffer.toString('ascii', 0, 4)).toBe('PMAI');

      // File should contain all three section tags
      let foundPWV6 = false;
      let foundPWV7 = false;
      let foundPWVC = false;

      // Search for section tags after header (offset 12)
      for (let i = 12; i < buffer.length - 4; i++) {
        const tag = buffer.readUInt32BE(i);
        if (tag === SectionTags.WAVE_COLOR_3CHANNEL) {
          foundPWV6 = true;
        }
        if (tag === SectionTags.WAVE_HD) {
          foundPWV7 = true;
        }
        if (tag === SectionTags.VOCAL_CONFIG) {
          foundPWVC = true;
        }
      }

      expect(foundPWV6).toBe(true);
      expect(foundPWV7).toBe(true);
      expect(foundPWVC).toBe(true);
    });

    it('creates valid 2EX file with single section', () => {
      const buffer = create2EXFile({
        pwv6: {numEntries: 50},
      });

      // Should contain PWV6 but not PWV7 or PWVC
      let foundPWV6 = false;
      let foundPWV7 = false;
      let foundPWVC = false;

      for (let i = 12; i < buffer.length - 4; i++) {
        const tag = buffer.readUInt32BE(i);
        if (tag === SectionTags.WAVE_COLOR_3CHANNEL) {
          foundPWV6 = true;
        }
        if (tag === SectionTags.WAVE_HD) {
          foundPWV7 = true;
        }
        if (tag === SectionTags.VOCAL_CONFIG) {
          foundPWVC = true;
        }
      }

      expect(foundPWV6).toBe(true);
      expect(foundPWV7).toBe(false);
      expect(foundPWVC).toBe(false);
    });

    it('creates valid EXT file with PWV5 section', () => {
      const buffer = createEXTFile({
        pwv5: {numEntries: 1000},
      });

      // Check header
      expect(buffer.toString('ascii', 0, 4)).toBe('PMAI');

      // Should contain PWV5
      let foundPWV5 = false;
      for (let i = 12; i < buffer.length - 4; i++) {
        if (buffer.readUInt32BE(i) === SectionTags.WAVE_COLOR_SCROLL) {
          foundPWV5 = true;
          break;
        }
      }

      expect(foundPWV5).toBe(true);
    });
  });

  // ==========================================================================
  // Data Integrity Tests
  // ==========================================================================
  describe('data integrity', () => {
    it('preserves exact waveform data in PWV6', () => {
      const data = new Uint8Array([
        255,
        0,
        128, // Entry 1: R=255, G=0, B=128
        0,
        255,
        64, // Entry 2: R=0, G=255, B=64
        100,
        100,
        100, // Entry 3: R=100, G=100, B=100
      ]);

      const section = createPWV6Section({numEntries: 3, data});

      // Extract and verify data (offset 20 = 12 header + 4 len_entry_bytes + 4 len_entries)
      const extractedData = section.slice(20, 20 + 9);
      expect(Array.from(extractedData)).toEqual(Array.from(data));
    });

    it('preserves exact waveform data in PWV7', () => {
      const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);

      const section = createPWV7Section({
        numEntries: 4,
        data,
      });

      // Extract and verify data (offset 24 = 12 header + 4 len_entry_bytes + 4 len_entries + 4 unknown)
      const extractedData = section.slice(24, 24 + 12);
      expect(Array.from(extractedData)).toEqual(Array.from(data));
    });

    it('handles large waveform data', () => {
      const numEntries = 30000; // Typical for HD waveforms
      const dataLength = numEntries * 3;
      const data = new Uint8Array(dataLength);
      for (let i = 0; i < dataLength; i++) {
        data[i] = i % 256;
      }

      const section = createPWV7Section({numEntries, data});

      // Verify data was stored (len_entries at offset 16)
      expect(section.readUInt32BE(16)).toBe(numEntries);

      // Verify first and last bytes of data (data starts at offset 24)
      expect(section[24]).toBe(0);
      expect(section[24 + dataLength - 1]).toBe((dataLength - 1) % 256);
    });
  });

  // ==========================================================================
  // Section Tag Constants
  // ==========================================================================
  describe('section tags', () => {
    it('has correct PWV5 tag (WAVE_COLOR_SCROLL)', () => {
      // PWV5 = 0x50575635 = "PWV5" in ASCII
      expect(SectionTags.WAVE_COLOR_SCROLL).toBe(0x50575635);
    });

    it('has correct PWV6 tag (WAVE_COLOR_3CHANNEL)', () => {
      // PWV6 = 0x50575636 = "PWV6" in ASCII
      expect(SectionTags.WAVE_COLOR_3CHANNEL).toBe(0x50575636);
    });

    it('has correct PWV7 tag (WAVE_HD)', () => {
      // PWV7 = 0x50575637 = "PWV7" in ASCII
      expect(SectionTags.WAVE_HD).toBe(0x50575637);
    });

    it('has correct PWVC tag (VOCAL_CONFIG)', () => {
      // PWVC = 0x50575643 = "PWVC" in ASCII
      expect(SectionTags.VOCAL_CONFIG).toBe(0x50575643);
    });
  });
});
