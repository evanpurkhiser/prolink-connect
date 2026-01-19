/**
 * OneLibrary Adapter Tests
 *
 * Comprehensive tests for the OneLibraryAdapter using a mock encrypted database
 * that matches the exact schema of rekordbox's exportLibrary.db.
 *
 * These tests verify all adapter functionality without needing real hardware.
 */

import * as fs from 'fs';
import * as path from 'path';

import {OneLibraryAdapter} from 'src/localdb/onelibrary';
import {CueAndLoop} from 'src/types';

const FIXTURE_DB = path.join(__dirname, 'fixtures', 'test-onelibrary.db');

// Skip if fixture doesn't exist (run create-test-db.ts first)
const describeIfFixture = fs.existsSync(FIXTURE_DB) ? describe : describe.skip;

describeIfFixture('OneLibraryAdapter', () => {
  let adapter: OneLibraryAdapter;

  beforeAll(() => {
    adapter = new OneLibraryAdapter(FIXTURE_DB);
  });

  afterAll(() => {
    adapter.close();
  });

  // ==========================================================================
  // Track Queries
  // ==========================================================================
  describe('Track queries', () => {
    describe('findTrack', () => {
      it('finds a track by ID with full metadata', () => {
        const track = adapter.findTrack(1);

        expect(track).not.toBeNull();
        expect(track!.id).toBe(1);
        expect(track!.title).toBe('Test Track');
        expect(track!.mixName).toBe('Extended Mix');
        expect(track!.tempo).toBe(128); // bpmx100 / 100
        expect(track!.duration).toBe(300); // milliseconds / 1000
        expect(track!.rating).toBe(5);
        expect(track!.trackNumber).toBe(1);
        expect(track!.discNumber).toBe(1);
        expect(track!.comment).toBe('Test comment');
        expect(track!.filePath).toBe('/Music/test.mp3');
        expect(track!.fileName).toBe('test.mp3');
        expect(track!.fileSize).toBe(5000000);
        expect(track!.bitrate).toBe(320);
        expect(track!.sampleRate).toBe(44100);
        expect(track!.sampleDepth).toBe(16);
        expect(track!.playCount).toBe(10);
        expect(track!.autoloadHotcues).toBe(true);
        expect(track!.kuvoPublic).toBe(true);
      });

      it('returns null for non-existent track', () => {
        const track = adapter.findTrack(999);
        expect(track).toBeNull();
      });

      it('handles track with minimal metadata', () => {
        const track = adapter.findTrack(3);

        expect(track).not.toBeNull();
        expect(track!.id).toBe(3);
        expect(track!.title).toBe('Unknown Track');
        expect(track!.tempo).toBe(0);
        expect(track!.artist).toBeNull();
        expect(track!.album).toBeNull();
        expect(track!.genre).toBeNull();
        expect(track!.key).toBeNull();
        expect(track!.color).toBeNull();
        expect(track!.label).toBeNull();
        expect(track!.artwork).toBeNull();
      });
    });

    describe('findAllTracks', () => {
      it('returns all tracks', () => {
        const tracks = adapter.findAllTracks();

        expect(tracks.length).toBe(5);
        expect(tracks.map(t => t.id)).toEqual([1, 2, 3, 4, 5]);
      });

      it('includes full metadata for each track', () => {
        const tracks = adapter.findAllTracks();
        const track1 = tracks.find(t => t.id === 1);

        expect(track1!.title).toBe('Test Track');
        expect(track1!.artist).not.toBeNull();
        expect(track1!.artist!.name).toBe('Test Artist');
      });
    });

    describe('relations', () => {
      it('populates artist relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.artist).not.toBeNull();
        expect(track!.artist!.id).toBe(1);
        expect(track!.artist!.name).toBe('Test Artist');
      });

      it('populates remixer relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.remixer).not.toBeNull();
        expect(track!.remixer!.id).toBe(3);
        expect(track!.remixer!.name).toBe('Remixer One');
      });

      it('populates album relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.album).not.toBeNull();
        expect(track!.album!.id).toBe(1);
        expect(track!.album!.name).toBe('Test Album');
      });

      it('populates genre relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.genre).not.toBeNull();
        expect(track!.genre!.id).toBe(1);
        expect(track!.genre!.name).toBe('Electronic');
      });

      it('populates key relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.key).not.toBeNull();
        expect(track!.key!.id).toBe(1);
        expect(track!.key!.name).toBe('Am');
      });

      it('populates color relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.color).not.toBeNull();
        expect(track!.color!.id).toBe(1);
        expect(track!.color!.name).toBe('Pink');
      });

      it('populates label relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.label).not.toBeNull();
        expect(track!.label!.id).toBe(1);
        expect(track!.label!.name).toBe('Test Label');
      });

      it('populates artwork relation', () => {
        const track = adapter.findTrack(1);

        expect(track!.artwork).not.toBeNull();
        expect(track!.artwork!.id).toBe(1);
        expect(track!.artwork!.path).toBe('/PIONEER/USBANLZ/P001/0001/artwork.jpg');
      });

      it('handles null relations gracefully', () => {
        const track = adapter.findTrack(2);

        expect(track!.remixer).toBeNull();
        expect(track!.label).toBeNull();
        expect(track!.artwork).toBeNull();
      });
    });

    describe('unit conversions', () => {
      it('converts BPM from bpmx100', () => {
        const track1 = adapter.findTrack(1);
        const track2 = adapter.findTrack(2);

        expect(track1!.tempo).toBe(128); // 12800 / 100
        expect(track2!.tempo).toBe(140); // 14000 / 100
      });

      it('converts duration from milliseconds to seconds', () => {
        const track1 = adapter.findTrack(1);
        const track2 = adapter.findTrack(2);

        expect(track1!.duration).toBe(300); // 300000ms
        expect(track2!.duration).toBe(240); // 240000ms
      });

      it('handles zero BPM', () => {
        const track = adapter.findTrack(3);
        expect(track!.tempo).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Cue Queries
  // ==========================================================================
  describe('Cue queries', () => {
    describe('findCues', () => {
      it('finds all cues for a track', () => {
        const cues = adapter.findCues(1);
        expect(cues.length).toBe(4);
      });

      it('returns empty array for track with no cues', () => {
        const cues = adapter.findCues(2);
        expect(cues).toEqual([]);
      });

      it('returns empty array for non-existent track', () => {
        const cues = adapter.findCues(999);
        expect(cues).toEqual([]);
      });
    });

    describe('cue types', () => {
      it('identifies memory cue (kind=0, no loop)', () => {
        const cues = adapter.findCues(1);
        const memoryCue = cues.find((c: CueAndLoop) => c.type === 'cue_point');

        expect(memoryCue).toBeDefined();
        expect(memoryCue!.offset).toBe(0); // inUsec / 1000
      });

      it('identifies hot cue (kind=1-8, no loop)', () => {
        const cues = adapter.findCues(1);
        const hotCue = cues.find(
          (c: CueAndLoop) => c.type === 'hot_cue' && 'button' in c && c.button === 1
        );

        expect(hotCue).toBeDefined();
        expect(hotCue!.offset).toBe(32000); // 32000000 / 1000
      });

      it('identifies loop (has outUsec)', () => {
        const cues = adapter.findCues(1);
        const loop = cues.find((c: CueAndLoop) => c.type === 'loop' && 'length' in c);

        expect(loop).toBeDefined();
        if (loop && 'length' in loop) {
          expect(loop.length).toBe(16000); // (80000000 - 64000000) / 1000
        }
      });

      it('identifies hot loop (hot cue with loop)', () => {
        const cues = adapter.findCues(1);
        const hotLoop = cues.find((c: CueAndLoop) => c.type === 'hot_loop');

        expect(hotLoop).toBeDefined();
        if (hotLoop && 'button' in hotLoop && 'length' in hotLoop) {
          expect(hotLoop.button).toBe(2);
          expect(hotLoop.length).toBe(8000); // (136000000 - 128000000) / 1000
        }
      });
    });

    describe('cue metadata', () => {
      it('includes cue offset in milliseconds', () => {
        const cues = adapter.findCues(1);
        const offsets = cues.map((c: CueAndLoop) => c.offset);

        expect(offsets).toContain(0);
        expect(offsets).toContain(32000);
        expect(offsets).toContain(64000);
        expect(offsets).toContain(128000);
      });

      it('includes label (cueComment)', () => {
        const cues = adapter.findCues(1);
        const hotCue = cues.find((c: CueAndLoop) => c.type === 'hot_cue');

        expect(hotCue!.label).toBe('Drop');
      });
    });
  });

  // ==========================================================================
  // Playlist Queries
  // ==========================================================================
  describe('Playlist queries', () => {
    describe('findPlaylist', () => {
      it('finds root-level playlists and folders', () => {
        const result = adapter.findPlaylist();

        expect(result.playlists.length).toBe(2); // My Favorites, Empty Playlist
        expect(result.folders.length).toBe(1); // DJ Sets
      });

      it('returns playlists with correct properties', () => {
        const result = adapter.findPlaylist();
        const favorites = result.playlists.find(p => p.name === 'My Favorites');

        expect(favorites).toBeDefined();
        expect(favorites!.id).toBe(1);
        expect(favorites!.isFolder).toBe(false);
      });

      it('returns folders with correct properties', () => {
        const result = adapter.findPlaylist();
        const djSets = result.folders.find(f => f.name === 'DJ Sets');

        expect(djSets).toBeDefined();
        expect(djSets!.id).toBe(2);
        expect(djSets!.isFolder).toBe(true);
      });

      it('finds nested playlists within folder', () => {
        const root = adapter.findPlaylist();
        const folderId = root.folders.find(f => f.name === 'DJ Sets')!.id;
        const nested = adapter.findPlaylist(folderId);

        expect(nested.playlists.length).toBe(2); // Club Night, Festival
        expect(nested.playlists.map(p => p.name)).toContain('Club Night');
        expect(nested.playlists.map(p => p.name)).toContain('Festival');
        expect(nested.folders.length).toBe(0);
      });
    });

    describe('findPlaylistContents', () => {
      it('returns track IDs in playlist order', () => {
        const contents = adapter.findPlaylistContents(1);
        expect(contents).toEqual([1, 2, 4]);
      });

      it('returns empty array for empty playlist', () => {
        const contents = adapter.findPlaylistContents(5);
        expect(contents).toEqual([]);
      });

      it('returns empty array for non-existent playlist', () => {
        const contents = adapter.findPlaylistContents(999);
        expect(contents).toEqual([]);
      });

      it('returns correct contents for nested playlist', () => {
        const contents = adapter.findPlaylistContents(3); // Club Night
        expect(contents).toEqual([1, 4, 5]);
      });
    });
  });

  // ==========================================================================
  // MyTag Queries
  // ==========================================================================
  describe('MyTag queries', () => {
    describe('findMyTags', () => {
      it('finds root-level tags and folders', () => {
        const result = adapter.findMyTags();

        expect(result.tags.length).toBe(2); // Favorites, Classics
        expect(result.folders.length).toBe(1); // Energy
      });

      it('identifies folders correctly', () => {
        const result = adapter.findMyTags();
        const folder = result.folders.find(f => f.name === 'Energy');

        expect(folder).toBeDefined();
        expect(folder!.isFolder).toBe(true);
      });

      it('identifies tags correctly', () => {
        const result = adapter.findMyTags();
        const tag = result.tags.find(t => t.name === 'Favorites');

        expect(tag).toBeDefined();
        expect(tag!.isFolder).toBe(false);
      });

      it('finds nested tags within folder', () => {
        const root = adapter.findMyTags();
        const folderId = root.folders.find(f => f.name === 'Energy')!.id;
        const nested = adapter.findMyTags(folderId);

        expect(nested.tags.length).toBe(2); // High Energy, Low Energy
        expect(nested.folders.length).toBe(0);
      });
    });

    describe('findMyTagById', () => {
      it('finds tag by ID', () => {
        const tag = adapter.findMyTagById(1);

        expect(tag).not.toBeNull();
        expect(tag!.name).toBe('Favorites');
        expect(tag!.isFolder).toBe(false);
      });

      it('finds folder by ID', () => {
        const folder = adapter.findMyTagById(2);

        expect(folder).not.toBeNull();
        expect(folder!.name).toBe('Energy');
        expect(folder!.isFolder).toBe(true);
      });

      it('returns null for non-existent ID', () => {
        const tag = adapter.findMyTagById(999);
        expect(tag).toBeNull();
      });
    });

    describe('findMyTagContents', () => {
      it('returns track IDs for tag', () => {
        const contents = adapter.findMyTagContents(1); // Favorites
        expect(contents).toEqual([1, 4]);
      });

      it('returns empty array for tag with no contents', () => {
        const contents = adapter.findMyTagContents(2); // Energy folder
        expect(contents).toEqual([]);
      });
    });

    describe('findMyTagsForTrack', () => {
      it('finds all tags containing a track', () => {
        const tags = adapter.findMyTagsForTrack(1);

        expect(tags.length).toBe(3); // Favorites, High Energy, Classics
        expect(tags.map(t => t.name)).toContain('Favorites');
        expect(tags.map(t => t.name)).toContain('High Energy');
        expect(tags.map(t => t.name)).toContain('Classics');
      });

      it('returns empty array for track not in any tags', () => {
        const tags = adapter.findMyTagsForTrack(3);
        expect(tags).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // History Queries
  // ==========================================================================
  describe('History queries', () => {
    describe('findHistorySessions', () => {
      it('returns all history sessions', () => {
        const sessions = adapter.findHistorySessions();
        expect(sessions.length).toBe(3);
      });

      it('returns sessions with correct properties', () => {
        const sessions = adapter.findHistorySessions();
        const session = sessions.find(s => s.name === '2024-01-01');

        expect(session).toBeDefined();
        expect(session!.id).toBe(1);
      });
    });

    describe('findHistoryContents', () => {
      it('returns track IDs in play order', () => {
        const contents = adapter.findHistoryContents(1);
        expect(contents).toEqual([1, 2, 4]);
      });

      it('returns correct contents for different session', () => {
        const contents = adapter.findHistoryContents(2);
        expect(contents).toEqual([4, 5, 1]);
      });

      it('returns empty array for non-existent session', () => {
        const contents = adapter.findHistoryContents(999);
        expect(contents).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // HotCueBankList Queries
  // ==========================================================================
  describe('HotCueBankList queries', () => {
    describe('findHotCueBankLists', () => {
      it('returns all bank lists', () => {
        const lists = adapter.findHotCueBankLists();
        expect(lists.length).toBe(2);
      });

      it('returns bank lists with correct properties', () => {
        const lists = adapter.findHotCueBankLists();

        expect(lists.map(l => l.name)).toContain('Bank A');
        expect(lists.map(l => l.name)).toContain('Bank B');
      });
    });

    describe('findHotCueBankListCues', () => {
      it('returns cue IDs for bank list', () => {
        const lists = adapter.findHotCueBankLists();
        const bankA = lists.find(l => l.name === 'Bank A');
        const cues = adapter.findHotCueBankListCues(bankA!.id);

        expect(cues).toEqual([2, 4]);
      });

      it('returns empty array for non-existent bank list', () => {
        const cues = adapter.findHotCueBankListCues(999);
        expect(cues).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // Menu Configuration Queries
  // ==========================================================================
  describe('Menu configuration queries', () => {
    describe('findMenuItems', () => {
      it('returns all menu items', () => {
        const items = adapter.findMenuItems();
        expect(items.length).toBe(5);
      });

      it('returns menu items with correct properties', () => {
        const items = adapter.findMenuItems();
        const genre = items.find(i => i.name === 'Genre');

        expect(genre).toBeDefined();
        expect(genre!.kind).toBe(128);
      });
    });

    describe('findVisibleCategories', () => {
      it('returns only visible categories', () => {
        const categories = adapter.findVisibleCategories();

        // isVisible=1: Genre, Artist, Album, Key
        // isVisible=0: Track
        expect(categories.length).toBe(4);
      });

      it('does not include hidden categories', () => {
        const categories = adapter.findVisibleCategories();
        const trackCategory = categories.find(c => c.name === 'Track');

        expect(trackCategory).toBeUndefined();
      });
    });

    describe('findVisibleSortOptions', () => {
      it('returns only visible sort options', () => {
        const sorts = adapter.findVisibleSortOptions();

        // isVisible=1: Genre, Artist, Track
        // isVisible=0: Album
        expect(sorts.length).toBe(3);
      });
    });
  });

  // ==========================================================================
  // Property Queries
  // ==========================================================================
  describe('Property queries', () => {
    describe('getProperty', () => {
      it('returns device property', () => {
        const property = adapter.getProperty();

        expect(property).not.toBeNull();
        expect(property!.deviceName).toBe('Test Device');
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge cases', () => {
    it('handles multiple calls without issues', () => {
      // Call same method multiple times
      const tracks1 = adapter.findAllTracks();
      const tracks2 = adapter.findAllTracks();

      expect(tracks1.length).toBe(tracks2.length);
    });

    it('handles concurrent-like access', () => {
      // Multiple different queries
      const [tracks, playlists, tags] = [
        adapter.findAllTracks(),
        adapter.findPlaylist(),
        adapter.findMyTags(),
      ];

      expect(tracks.length).toBe(5);
      expect(playlists.playlists.length).toBe(2);
      expect(tags.tags.length).toBe(2);
    });
  });
});
