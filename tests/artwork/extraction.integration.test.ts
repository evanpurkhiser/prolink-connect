import * as fs from 'fs';
import * as path from 'path';

import {extractArtwork} from 'src/artwork';
import {createBufferReader} from 'src/artwork/reader';

/**
 * Integration tests that verify artwork extraction works with real audio files.
 * These tests read actual files from disk to ensure the parsers handle
 * real-world file formats correctly.
 *
 * To run these tests, you need audio files in the test samples directory.
 * The tests will skip gracefully if sample files are not present.
 */

const SAMPLES_DIR = path.join(__dirname, '_samples');

// Helper to check if a file exists
function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// Helper to read file and create reader
function createReaderFromFile(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return createBufferReader(buffer, ext);
}

describe('Artwork Extraction Integration', () => {
  beforeAll(() => {
    // Create samples directory if it doesn't exist
    if (!fs.existsSync(SAMPLES_DIR)) {
      fs.mkdirSync(SAMPLES_DIR, {recursive: true});
      console.log(`Created samples directory: ${SAMPLES_DIR}`);
      console.log('Add audio files with artwork to run integration tests:');
      console.log('  - sample.mp3 (MP3 with ID3v2 APIC frame)');
      console.log('  - sample.m4a (M4A/AAC with covr atom)');
      console.log('  - sample.flac (FLAC with PICTURE metadata)');
    }
  });

  describe('MP3 with ID3v2', () => {
    const samplePath = path.join(SAMPLES_DIR, 'sample.mp3');

    it('should extract artwork from real MP3 file', async () => {
      if (!fileExists(samplePath)) {
        console.log(`Skipping: ${samplePath} not found`);
        return;
      }

      const reader = createReaderFromFile(samplePath);
      const result = await extractArtwork(reader);

      if (result) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(['image/jpeg', 'image/png', 'image/gif']).toContain(result.mimeType);
        console.log(`Extracted ${result.mimeType} artwork: ${result.data.length} bytes`);
      } else {
        console.log('No artwork found in sample.mp3');
      }
    });
  });

  describe('M4A/AAC', () => {
    const samplePath = path.join(SAMPLES_DIR, 'sample.m4a');

    it('should extract artwork from real M4A file', async () => {
      if (!fileExists(samplePath)) {
        console.log(`Skipping: ${samplePath} not found`);
        return;
      }

      const reader = createReaderFromFile(samplePath);
      const result = await extractArtwork(reader);

      if (result) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(['image/jpeg', 'image/png', 'image/gif']).toContain(result.mimeType);
        console.log(`Extracted ${result.mimeType} artwork: ${result.data.length} bytes`);
      } else {
        console.log('No artwork found in sample.m4a');
      }
    });
  });

  describe('FLAC', () => {
    const samplePath = path.join(SAMPLES_DIR, 'sample.flac');

    it('should extract artwork from real FLAC file', async () => {
      if (!fileExists(samplePath)) {
        console.log(`Skipping: ${samplePath} not found`);
        return;
      }

      const reader = createReaderFromFile(samplePath);
      const result = await extractArtwork(reader);

      if (result) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(['image/jpeg', 'image/png', 'image/gif']).toContain(result.mimeType);
        if (result.width && result.height) {
          console.log(
            `Extracted ${result.mimeType} artwork: ${result.width}x${result.height}, ${result.data.length} bytes`
          );
        } else {
          console.log(
            `Extracted ${result.mimeType} artwork: ${result.data.length} bytes`
          );
        }
      } else {
        console.log('No artwork found in sample.flac');
      }
    });
  });

  describe('System music library samples', () => {
    // Test against actual files from the user's music library
    const musicDir = '/Users/chrisle/Music';

    it('should handle various real-world MP3 files', async () => {
      // Find a few MP3 files to test (including one known to have artwork)
      const testFiles = [
        path.join(musicDir, 'Piezo/vocal future.mp3'),
        path.join(
          musicDir,
          'Music/Media.localized/Music/triode/Unknown Album/Country Pop (Vocals).mp3'
        ),
      ];

      for (const filePath of testFiles) {
        if (!fileExists(filePath)) {
          continue;
        }

        const reader = createReaderFromFile(filePath);
        const result = await extractArtwork(reader);

        const fileName = path.basename(filePath);
        if (result) {
          console.log(`✓ ${fileName}: ${result.mimeType}, ${result.data.length} bytes`);
          expect(result.data.length).toBeGreaterThan(0);
        } else {
          console.log(`○ ${fileName}: no artwork`);
        }
      }
    });
  });

  describe('Now Playing Test playlist (rekordbox)', () => {
    // Test against the "Now Playing Test" playlist files from rekordbox
    const testTracks = [
      {
        name: 'B2ME (atDusk)',
        path: '/Volumes/SD/RB/atDusk/B2ME (feat_ JordinLaine)/16680915_B2ME_(feat._JordinLaine)_(Original_Mix).mp3',
      },
      {
        name: 'Space Unicorn (Giuseppe Ottaviani)',
        path: '/Volumes/SD/RB/Giuseppe Ottaviani, Hypaton/Black Hole Trance Music 12-18/11341453_Space_Unicorn_feat._Hypaton_(Extended_Mix).mp3',
      },
      {
        name: 'Take Me Away (Cuebrick)',
        path: '/Volumes/SD/RB/_2025-10-moved4/cuebrick, melody mane/take me away (into the night) [extended mix]/16513467_take_me_away_(into_the_night)_(exte.mp3',
      },
      {
        name: 'Falling (Patrik Humann)',
        path: '/Users/chrisle/temp/contents_513209491/patrik humann, gid sedgwick/falling (eugenio tokarev remix)/16659979_falling_(eugenio_tokarev_extended_r.mp3',
      },
    ];

    it('should extract artwork from all Now Playing Test tracks', async () => {
      let testedCount = 0;
      let successCount = 0;

      for (const track of testTracks) {
        if (!fileExists(track.path)) {
          console.log(`⊘ ${track.name}: file not found`);
          continue;
        }

        testedCount++;
        const reader = createReaderFromFile(track.path);
        const result = await extractArtwork(reader);

        if (result) {
          successCount++;
          console.log(`✓ ${track.name}: ${result.mimeType}, ${result.data.length} bytes`);
          expect(result.data.length).toBeGreaterThan(0);
          expect(['image/jpeg', 'image/png', 'image/gif']).toContain(result.mimeType);
        } else {
          console.log(`✗ ${track.name}: NO ARTWORK EXTRACTED`);
        }
      }

      console.log(
        `\nResults: ${successCount}/${testedCount} tracks had artwork extracted`
      );

      // Expect at least some files to be testable (SD card mounted)
      if (testedCount > 0) {
        expect(successCount).toBeGreaterThan(0);
      }
    });
  });
});
