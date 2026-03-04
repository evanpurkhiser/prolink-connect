/**
 * Requesting Vocal Detection Configuration
 *
 * Tests the request flow for vocal detection configuration through the
 * loadAnlz pipeline. Verifies that the VOCAL_CONFIG (PWVC) section tag
 * is correctly dispatched to makeVocalConfig and that the resulting
 * VocalConfig is properly included in the AnlzResponse2EX.
 *
 * These tests mock the Kaitai parser to simulate what it would produce
 * from real .2EX binary data, then verify the loadAnlz switch statement
 * correctly handles the VOCAL_CONFIG case.
 */

import {loadAnlz} from 'src/localdb/rekordbox';
import type {AnlzResolver} from 'src/localdb/rekordbox/types';

// Section tag constants matching RekordboxAnlz.SectionTags
const SECTION_TAGS = {
  WAVE_COLOR_3BAND_PREVIEW: 'wave_color_3band_preview',
  WAVE_COLOR_3BAND_DETAIL: 'wave_color_3band_detail',
  VOCAL_CONFIG: 'vocal_config',
};

// Mock the Kaitai dependencies
jest.mock('kaitai-struct', () => ({
  KaitaiStream: jest.fn(),
}));

// Track the mock sections that RekordboxAnlz will return
let mockSections: Array<{fourcc: string; body: Record<string, unknown>}> = [];

// Mock the hydrator to avoid the rekordbox_pdb.ksy import chain
jest.mock('src/localdb/rekordbox/hydrator', () => ({
  RekordboxHydrator: jest.fn(),
}));

jest.mock('src/localdb/kaitai/rekordbox_anlz.ksy', () => {
  function MockRekordboxAnlz() {
    return {sections: mockSections};
  }

  MockRekordboxAnlz.SectionTags = {
    BEAT_GRID: 'beat_grid',
    CUES: 'cues',
    CUES_2: 'cues_2',
    WAVE_PREVIEW: 'wave_preview',
    WAVE_TINY: 'wave_tiny',
    WAVE_SCROLL: 'wave_scroll',
    WAVE_COLOR_PREVIEW: 'wave_color_preview',
    WAVE_COLOR_SCROLL: 'wave_color_scroll',
    SONG_STRUCTURE: 'song_structure',
    WAVE_COLOR_3BAND_PREVIEW: 'wave_color_3band_preview',
    WAVE_COLOR_3BAND_DETAIL: 'wave_color_3band_detail',
    VOCAL_CONFIG: 'vocal_config',
    VBR: 'vbr',
    PATH: 'path',
  };

  return MockRekordboxAnlz;
});

// Minimal track entity for testing
const mockTrack = {
  id: 1,
  title: 'Test Track',
  duration: 300,
  tempo: 128,
  comment: '',
  rating: 0,
  filePath: '/music/test.mp3',
  fileName: 'test.mp3',
  analyzePath: '/music/PIONEER/USBANLZ/P000/0000/ANLZ0000',
  artwork: null,
  artist: null,
  originalArtist: null,
  remixer: null,
  composer: null,
  album: null,
  label: null,
  genre: null,
  color: null,
  key: null,
  beatGrid: null,
  cueAndLoops: null,
  waveformHd: null,
};

// Mock ANLZ resolver that returns an empty buffer (Kaitai is mocked anyway)
const mockResolver: AnlzResolver = jest.fn().mockResolvedValue(Buffer.alloc(0));

describe('Requesting Vocal Detection Configuration', () => {
  beforeEach(() => {
    mockSections = [];
    jest.clearAllMocks();
  });

  describe('loadAnlz with VOCAL_CONFIG section', () => {
    it('extracts vocal config from .2EX file with PWVC section', async () => {
      mockSections = [
        {
          fourcc: SECTION_TAGS.VOCAL_CONFIG,
          body: {
            thresholdLow: 97,
            thresholdMid: 114,
            thresholdHigh: 130,
          },
        },
      ];

      const result = await loadAnlz(mockTrack, '2EX', mockResolver);

      expect(result.vocalConfig).toEqual({
        thresholdLow: 97,
        thresholdMid: 114,
        thresholdHigh: 130,
      });
    });

    it('resolves the correct .2EX file path from track analyzePath', async () => {
      mockSections = [];

      await loadAnlz(mockTrack, '2EX', mockResolver);

      expect(mockResolver).toHaveBeenCalledWith(
        '/music/PIONEER/USBANLZ/P000/0000/ANLZ0000.2EX'
      );
    });

    it('returns undefined vocalConfig when .2EX has no PWVC section', async () => {
      mockSections = [
        {
          fourcc: SECTION_TAGS.WAVE_COLOR_3BAND_PREVIEW,
          body: {
            lenEntries: 100,
            entries: new Uint8Array(300),
          },
        },
      ];

      const result = await loadAnlz(mockTrack, '2EX', mockResolver);

      expect(result.vocalConfig).toBeUndefined();
    });

    it('extracts vocal config alongside waveform sections', async () => {
      mockSections = [
        {
          fourcc: SECTION_TAGS.WAVE_COLOR_3BAND_PREVIEW,
          body: {
            lenEntries: 50,
            entries: new Uint8Array(150),
          },
        },
        {
          fourcc: SECTION_TAGS.WAVE_COLOR_3BAND_DETAIL,
          body: {
            samplesPerBeat: 150,
            lenEntries: 1000,
            entries: new Uint8Array(3000),
          },
        },
        {
          fourcc: SECTION_TAGS.VOCAL_CONFIG,
          body: {
            thresholdLow: 10,
            thresholdMid: 50,
            thresholdHigh: 90,
          },
        },
      ];

      const result = await loadAnlz(mockTrack, '2EX', mockResolver);

      expect(result.vocalConfig).toEqual({
        thresholdLow: 10,
        thresholdMid: 50,
        thresholdHigh: 90,
      });
      expect(result.waveform3BandPreview).toBeDefined();
      expect(result.waveform3BandPreview!.numEntries).toBe(50);
      expect(result.waveform3BandDetail).toBeDefined();
      expect(result.waveform3BandDetail!.numEntries).toBe(1000);
    });

    it('handles zero threshold values', async () => {
      mockSections = [
        {
          fourcc: SECTION_TAGS.VOCAL_CONFIG,
          body: {
            thresholdLow: 0,
            thresholdMid: 0,
            thresholdHigh: 0,
          },
        },
      ];

      const result = await loadAnlz(mockTrack, '2EX', mockResolver);

      expect(result.vocalConfig).toEqual({
        thresholdLow: 0,
        thresholdMid: 0,
        thresholdHigh: 0,
      });
    });

    it('handles maximum observed threshold values', async () => {
      mockSections = [
        {
          fourcc: SECTION_TAGS.VOCAL_CONFIG,
          body: {
            thresholdLow: 114,
            thresholdMid: 146,
            thresholdHigh: 159,
          },
        },
      ];

      const result = await loadAnlz(mockTrack, '2EX', mockResolver);

      expect(result.vocalConfig).toEqual({
        thresholdLow: 114,
        thresholdMid: 146,
        thresholdHigh: 159,
      });
    });

    it('returns all three threshold fields as numbers', async () => {
      mockSections = [
        {
          fourcc: SECTION_TAGS.VOCAL_CONFIG,
          body: {
            thresholdLow: 100,
            thresholdMid: 200,
            thresholdHigh: 300,
          },
        },
      ];

      const result = await loadAnlz(mockTrack, '2EX', mockResolver);
      const vc = result.vocalConfig!;

      expect(typeof vc.thresholdLow).toBe('number');
      expect(typeof vc.thresholdMid).toBe('number');
      expect(typeof vc.thresholdHigh).toBe('number');
    });
  });

  describe('getTrackAnalysis vocal config flow', () => {
    it('vocal config is null when .2EX load fails', async () => {
      // Simulate the .catch(() => null) pattern from getTrackAnalysis.viaLocal
      const failingResolver: AnlzResolver = jest
        .fn()
        .mockRejectedValue(new Error('File not found'));

      const twoxResult = await loadAnlz(mockTrack, '2EX', failingResolver).catch(
        () => null
      );

      const vocalConfig = twoxResult?.vocalConfig ?? null;
      expect(vocalConfig).toBeNull();
    });

    it('vocal config is null when .2EX has no PWVC section', async () => {
      mockSections = [];

      const twoxResult = await loadAnlz(mockTrack, '2EX', mockResolver);
      const vocalConfig = twoxResult?.vocalConfig ?? null;

      expect(vocalConfig).toBeNull();
    });

    it('vocal config is populated from successful .2EX parse', async () => {
      mockSections = [
        {
          fourcc: SECTION_TAGS.VOCAL_CONFIG,
          body: {
            thresholdLow: 80,
            thresholdMid: 100,
            thresholdHigh: 110,
          },
        },
      ];

      const twoxResult = await loadAnlz(mockTrack, '2EX', mockResolver);
      const vocalConfig = twoxResult?.vocalConfig ?? null;

      expect(vocalConfig).toEqual({
        thresholdLow: 80,
        thresholdMid: 100,
        thresholdHigh: 110,
      });
    });
  });
});
