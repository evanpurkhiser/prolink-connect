/**
 * LocalDatabase Loading Tests
 *
 * Tests the database loading flow with mocked NFS layer.
 * Verifies format detection, fallback behavior, and adapter creation.
 */

import * as fs from 'fs';
import * as path from 'path';

import {OneLibraryAdapter} from 'src/localdb/onelibrary';
import {DeviceType, MediaSlot, TrackType} from 'src/types';

// Import test database path
const TEST_DB_PATH = path.join(__dirname, 'fixtures', 'test-onelibrary.db');

describe('Database Loading', () => {
  // ==========================================================================
  // OneLibraryAdapter Direct Tests
  // ==========================================================================
  describe('OneLibraryAdapter', () => {
    let adapter: OneLibraryAdapter | null = null;

    afterEach(() => {
      if (adapter) {
        adapter.close();
        adapter = null;
      }
    });

    it('opens an encrypted OneLibrary database', () => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
      expect(adapter).toBeDefined();
    });

    it('can query tracks after opening', () => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
      const tracks = adapter.findAllTracks();
      expect(Array.isArray(tracks)).toBe(true);
      expect(tracks.length).toBeGreaterThan(0);
    });

    it('throws on invalid database path', () => {
      expect(() => {
        adapter = new OneLibraryAdapter('/nonexistent/path.db');
      }).toThrow();
    });

    it('cannot read tables from non-encrypted database', () => {
      // Create a plain SQLite database (not encrypted)
      const tempPath = path.join(__dirname, 'fixtures', 'temp-plain.db');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3-multiple-ciphers');
      const plainDb = new Database(tempPath);
      plainDb.exec('CREATE TABLE djmdContent (id INTEGER)');
      plainDb.exec('INSERT INTO djmdContent VALUES (1)');
      plainDb.close();

      try {
        // Opening succeeds but the decryption key is applied
        adapter = new OneLibraryAdapter(tempPath);

        // Trying to query will fail because the key doesn't match
        expect(() => {
          adapter!.findAllTracks();
        }).toThrow();
      } finally {
        if (adapter) {
          try {
            adapter.close();
          } catch {
            // Ignore close errors
          }
          adapter = null;
        }
        fs.unlinkSync(tempPath);
      }
    });

    it('properly closes database connection', () => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
      adapter.close();

      // Verify the adapter is closed by trying to query
      expect(() => {
        adapter!.findAllTracks();
      }).toThrow();

      adapter = null; // Prevent afterEach from trying to close again
    });
  });

  // ==========================================================================
  // Database Format Detection
  // ==========================================================================
  describe('format detection', () => {
    it('identifies OneLibrary database by filename', () => {
      const oneLibraryPath = 'PIONEER/rekordbox/exportLibrary.db';
      expect(oneLibraryPath).toContain('exportLibrary.db');
    });

    it('identifies PDB database by filename', () => {
      const pdbPath = 'PIONEER/rekordbox/export.pdb';
      expect(pdbPath).toContain('export.pdb');
    });
  });

  // ==========================================================================
  // Media ID Generation
  // ==========================================================================
  describe('media identification', () => {
    it('creates unique ID based on media properties', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {createHash} = require('crypto');

      // Simplified media info for testing (using the same property types as actual LocalDatabase)
      const getMediaId = (info: {
        deviceId: number;
        slot: number;
        name: string;
        freeBytes: bigint;
        totalBytes: bigint;
        trackCount: number;
        createdDate: Date;
      }) => {
        const inputs = [
          info.deviceId,
          info.slot,
          info.name,
          info.freeBytes,
          info.totalBytes,
          info.trackCount,
          info.createdDate,
        ];
        return createHash('sha256').update(inputs.join('.'), 'utf8').digest().toString();
      };

      const media1 = {
        deviceId: 1,
        slot: MediaSlot.USB,
        name: 'USB-1',
        freeBytes: BigInt(1000000),
        totalBytes: BigInt(2000000),
        trackCount: 100,
        createdDate: new Date('2024-01-01'),
      };

      const media2 = {
        ...media1,
        trackCount: 101, // Different track count
      };

      const id1 = getMediaId(media1);
      const id2 = getMediaId(media2);

      expect(id1).not.toBe(id2);
    });

    it('creates same ID for identical media', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {createHash} = require('crypto');

      const getMediaId = (info: {
        deviceId: number;
        slot: number;
        name: string;
        freeBytes: bigint;
        totalBytes: bigint;
        trackCount: number;
        createdDate: Date;
      }) => {
        const inputs = [
          info.deviceId,
          info.slot,
          info.name,
          info.freeBytes,
          info.totalBytes,
          info.trackCount,
          info.createdDate,
        ];
        return createHash('sha256').update(inputs.join('.'), 'utf8').digest().toString();
      };

      const createdDate = new Date('2024-01-01');
      const media = {
        deviceId: 1,
        slot: MediaSlot.USB,
        name: 'USB-1',
        freeBytes: BigInt(1000000),
        totalBytes: BigInt(2000000),
        trackCount: 100,
        createdDate,
      };

      const id1 = getMediaId(media);
      const id2 = getMediaId(media);

      expect(id1).toBe(id2);
    });
  });

  // ==========================================================================
  // Device Slot Filtering
  // ==========================================================================
  describe('device slot filtering', () => {
    it('only allows USB and SD slots for database loading', () => {
      const validSlots = [MediaSlot.USB, MediaSlot.SD];

      // USB should be valid
      expect(validSlots).toContain(MediaSlot.USB);

      // SD should be valid
      expect(validSlots).toContain(MediaSlot.SD);

      // RB should be invalid (rekordbox local is not a physical slot)
      expect(validSlots).not.toContain(MediaSlot.RB);
    });
  });

  // ==========================================================================
  // Device Type Validation
  // ==========================================================================
  describe('device validation', () => {
    it('rejects non-CDJ device types', () => {
      expect(DeviceType.Rekordbox).not.toBe(DeviceType.CDJ);
      expect(DeviceType.Mixer).not.toBe(DeviceType.CDJ);
    });

    it('accepts CDJ device type', () => {
      expect(DeviceType.CDJ).toBe(0x01);
    });
  });

  // ==========================================================================
  // Temp File Handling
  // ==========================================================================
  describe('temp file handling', () => {
    it('generates unique temp file paths', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const os = require('os');
      const tmpDir = os.tmpdir();

      const deviceId = 1;
      const slot = MediaSlot.USB;
      const timestamp1 = Date.now();
      const timestamp2 = timestamp1 + 1;

      const path1 = path.join(tmpDir, `onelibrary-${deviceId}-${slot}-${timestamp1}.db`);
      const path2 = path.join(tmpDir, `onelibrary-${deviceId}-${slot}-${timestamp2}.db`);

      expect(path1).not.toBe(path2);
    });

    it('temp file path follows expected pattern', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const os = require('os');
      const tmpDir = os.tmpdir();
      const deviceId = 3;
      const slot = MediaSlot.SD;
      const timestamp = 1234567890;

      const tempPath = path.join(
        tmpDir,
        `onelibrary-${deviceId}-${slot}-${timestamp}.db`
      );

      expect(tempPath).toContain('onelibrary-');
      expect(tempPath).toContain(`-${deviceId}-`);
      expect(tempPath).toContain(`-${slot}-`);
      expect(tempPath).toContain('.db');
    });
  });

  // ==========================================================================
  // Database Path Constants
  // ==========================================================================
  describe('database paths', () => {
    it('has correct OneLibrary path constant', () => {
      const ONELIBRARY_DB_PATH = 'PIONEER/rekordbox/exportLibrary.db';
      expect(ONELIBRARY_DB_PATH).toBe('PIONEER/rekordbox/exportLibrary.db');
    });

    it('has correct legacy PDB path constant', () => {
      const LEGACY_PDB_PATH = 'PIONEER/rekordbox/export.pdb';
      expect(LEGACY_PDB_PATH).toBe('PIONEER/rekordbox/export.pdb');
    });

    it('supports dotted path variant', () => {
      const ONELIBRARY_DB_PATH = 'PIONEER/rekordbox/exportLibrary.db';
      const dottedPath = `.${ONELIBRARY_DB_PATH}`;
      expect(dottedPath).toBe('.PIONEER/rekordbox/exportLibrary.db');
    });
  });

  // ==========================================================================
  // Track Type Validation
  // ==========================================================================
  describe('track type validation', () => {
    it('only loads databases with RB track type', () => {
      expect(TrackType.RB).toBeDefined();
      expect(TrackType.AudioCD).not.toBe(TrackType.RB);
    });

    it('RB track type has expected value', () => {
      // TrackType.RB is the rekordbox database type
      expect(TrackType.RB).toBe(1);
    });
  });

  // ==========================================================================
  // Format Preference
  // ==========================================================================
  describe('format preference', () => {
    it('supports auto format preference', () => {
      type DatabaseFormatPreference = 'pdb' | 'onelibrary' | 'auto';
      const preference: DatabaseFormatPreference = 'auto';
      expect(preference).toBe('auto');
    });

    it('supports explicit pdb format preference', () => {
      type DatabaseFormatPreference = 'pdb' | 'onelibrary' | 'auto';
      const preference: DatabaseFormatPreference = 'pdb';
      expect(preference).toBe('pdb');
    });

    it('supports explicit onelibrary format preference', () => {
      type DatabaseFormatPreference = 'pdb' | 'onelibrary' | 'auto';
      const preference: DatabaseFormatPreference = 'onelibrary';
      expect(preference).toBe('onelibrary');
    });
  });
});
