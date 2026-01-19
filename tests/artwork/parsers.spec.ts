import {extractArtwork} from 'src/artwork';
import {extractFromAiff} from 'src/artwork/parsers/aiff';
import {extractFromFlac} from 'src/artwork/parsers/flac';
import {extractFromMp3} from 'src/artwork/parsers/id3';
import {extractFromMp4} from 'src/artwork/parsers/mp4';
import {createBufferReader} from 'src/artwork/reader';
import {PictureType} from 'src/artwork/types';

import {
  createAiffWithArtwork,
  createFlacWithArtwork,
  createMp3WithArtwork,
  createMp4WithArtwork,
  TINY_JPEG,
  TINY_PNG,
} from './fixtures';

describe('Artwork Extraction', () => {
  describe('ID3 Parser (MP3)', () => {
    it('should extract JPEG artwork from ID3v2.4 APIC frame', async () => {
      const mp3Data = createMp3WithArtwork(TINY_JPEG);
      const reader = createBufferReader(mp3Data, 'mp3');
      const result = await extractFromMp3(reader);

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/jpeg');
      expect(result!.pictureType).toBe(PictureType.FrontCover);
      expect(result!.data.equals(TINY_JPEG)).toBe(true);
    });

    it('should extract PNG artwork', async () => {
      const mp3Data = createMp3WithArtwork(TINY_PNG);
      const reader = createBufferReader(mp3Data, 'mp3');
      const result = await extractFromMp3(reader);

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/png');
    });

    it('should return null for non-ID3 data', async () => {
      const reader = createBufferReader(Buffer.from('not an mp3'), 'mp3');
      const result = await extractFromMp3(reader);
      expect(result).toBeNull();
    });
  });

  describe('MP4 Parser', () => {
    it('should extract artwork from MP4/M4A covr atom', async () => {
      const mp4Data = createMp4WithArtwork(TINY_JPEG);
      const reader = createBufferReader(mp4Data, 'm4a');
      const result = await extractFromMp4(reader);

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/jpeg');
      expect(result!.data.equals(TINY_JPEG)).toBe(true);
    });

    it('should return null for non-MP4 data', async () => {
      const reader = createBufferReader(Buffer.from('not an mp4'), 'm4a');
      const result = await extractFromMp4(reader);
      expect(result).toBeNull();
    });
  });

  describe('FLAC Parser', () => {
    it('should extract artwork from FLAC PICTURE metadata block', async () => {
      const flacData = createFlacWithArtwork(TINY_JPEG);
      const reader = createBufferReader(flacData, 'flac');
      const result = await extractFromFlac(reader);

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/jpeg');
      expect(result!.width).toBe(1);
      expect(result!.height).toBe(1);
      expect(result!.data.equals(TINY_JPEG)).toBe(true);
    });

    it('should return null for non-FLAC data', async () => {
      const reader = createBufferReader(Buffer.from('not a flac'), 'flac');
      const result = await extractFromFlac(reader);
      expect(result).toBeNull();
    });
  });

  describe('AIFF Parser', () => {
    it('should extract artwork from AIFF ID3 chunk', async () => {
      const aiffData = createAiffWithArtwork(TINY_JPEG);
      const reader = createBufferReader(aiffData, 'aiff');
      const result = await extractFromAiff(reader);

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/jpeg');
    });

    it('should return null for non-AIFF data', async () => {
      const reader = createBufferReader(Buffer.from('not an aiff'), 'aiff');
      const result = await extractFromAiff(reader);
      expect(result).toBeNull();
    });
  });

  describe('extractArtwork (auto-detection)', () => {
    it('should detect MP3 from extension', async () => {
      const mp3Data = createMp3WithArtwork(TINY_JPEG);
      const reader = createBufferReader(mp3Data, 'mp3');
      const result = await extractArtwork(reader);
      expect(result).not.toBeNull();
    });

    it('should detect M4A from extension', async () => {
      const mp4Data = createMp4WithArtwork(TINY_JPEG);
      const reader = createBufferReader(mp4Data, 'm4a');
      const result = await extractArtwork(reader);
      expect(result).not.toBeNull();
    });

    it('should detect FLAC from extension', async () => {
      const flacData = createFlacWithArtwork(TINY_JPEG);
      const reader = createBufferReader(flacData, 'flac');
      const result = await extractArtwork(reader);
      expect(result).not.toBeNull();
    });

    it('should detect AIFF from extension', async () => {
      const aiffData = createAiffWithArtwork(TINY_JPEG);
      const reader = createBufferReader(aiffData, 'aiff');
      const result = await extractArtwork(reader);
      expect(result).not.toBeNull();
    });
  });
});
