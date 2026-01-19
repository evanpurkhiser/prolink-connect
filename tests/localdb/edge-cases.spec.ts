/**
 * Edge Cases and Error Handling Tests
 *
 * Tests for boundary conditions, null handling, and error scenarios
 * in the OneLibrary adapter and related components.
 */

import * as path from 'path';

import {OneLibraryAdapter} from 'src/localdb/onelibrary';

// Import test database path
const TEST_DB_PATH = path.join(__dirname, 'fixtures', 'test-onelibrary.db');

describe('Edge Cases and Error Handling', () => {
  // ==========================================================================
  // OneLibraryAdapter Edge Cases
  // ==========================================================================
  describe('OneLibraryAdapter edge cases', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    describe('findTrack', () => {
      it('returns null for non-existent track ID', () => {
        const track = adapter.findTrack(999999);
        expect(track).toBeNull();
      });

      it('returns null for negative track ID', () => {
        const track = adapter.findTrack(-1);
        expect(track).toBeNull();
      });

      it('returns null for zero track ID', () => {
        const track = adapter.findTrack(0);
        expect(track).toBeNull();
      });
    });

    describe('findCues', () => {
      it('returns empty array for non-existent track', () => {
        const cues = adapter.findCues(999999);
        expect(cues).toEqual([]);
      });

      it('returns empty array for negative track ID', () => {
        const cues = adapter.findCues(-1);
        expect(cues).toEqual([]);
      });
    });

    describe('findPlaylistById', () => {
      it('returns null for non-existent playlist ID', () => {
        const playlist = adapter.findPlaylistById(999999);
        expect(playlist).toBeNull();
      });

      it('returns null for negative playlist ID', () => {
        const playlist = adapter.findPlaylistById(-1);
        expect(playlist).toBeNull();
      });
    });

    describe('findPlaylistContents', () => {
      it('returns empty array for non-existent playlist', () => {
        const contents = adapter.findPlaylistContents(999999);
        expect(contents).toEqual([]);
      });
    });

    describe('findMyTagById', () => {
      it('returns null for non-existent myTag ID', () => {
        const tag = adapter.findMyTagById(999999);
        expect(tag).toBeNull();
      });

      it('returns null for negative myTag ID', () => {
        const tag = adapter.findMyTagById(-1);
        expect(tag).toBeNull();
      });
    });

    describe('findMyTagContents', () => {
      it('returns empty array for non-existent myTag', () => {
        const contents = adapter.findMyTagContents(999999);
        expect(contents).toEqual([]);
      });
    });

    describe('findMyTagsForTrack', () => {
      it('returns empty array for non-existent track', () => {
        const tags = adapter.findMyTagsForTrack(999999);
        expect(tags).toEqual([]);
      });
    });

    describe('findHistoryContents', () => {
      it('returns empty array for non-existent session', () => {
        const contents = adapter.findHistoryContents(999999);
        expect(contents).toEqual([]);
      });
    });

    describe('findHotCueBankListCues', () => {
      it('returns empty array for non-existent list', () => {
        const cues = adapter.findHotCueBankListCues(999999);
        expect(cues).toEqual([]);
      });
    });

    describe('getProperty', () => {
      it('returns device property or null', () => {
        const value = adapter.getProperty();
        // Should either be null or have the expected structure
        if (value !== null) {
          expect(typeof value.deviceName).toBe('string');
          expect(typeof value.dbVersion).toBe('string');
          expect(typeof value.numberOfContents).toBe('number');
        }
      });
    });
  });

  // ==========================================================================
  // Data Integrity Tests
  // ==========================================================================
  describe('data integrity', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('findAllTracks returns consistent results', () => {
      const tracks1 = adapter.findAllTracks();
      const tracks2 = adapter.findAllTracks();

      expect(tracks1.length).toBe(tracks2.length);

      // IDs should match
      const ids1 = tracks1.map(t => t.id).sort();
      const ids2 = tracks2.map(t => t.id).sort();
      expect(ids1).toEqual(ids2);
    });

    it('findTrack returns same data as findAllTracks entry', () => {
      const allTracks = adapter.findAllTracks();
      if (allTracks.length > 0) {
        const trackFromAll = allTracks[0];
        const trackDirect = adapter.findTrack(trackFromAll.id);

        expect(trackDirect).not.toBeNull();
        expect(trackDirect!.id).toBe(trackFromAll.id);
        expect(trackDirect!.title).toBe(trackFromAll.title);
      }
    });

    it('playlist entry track IDs refer to actual tracks', () => {
      const result = adapter.findPlaylist();
      const nonFolderPlaylists = result.playlists.slice(0, 3);

      for (const playlist of nonFolderPlaylists) {
        const trackIds = adapter.findPlaylistContents(playlist.id);
        for (const trackId of trackIds) {
          const track = adapter.findTrack(trackId);
          expect(track).not.toBeNull();
        }
      }
    });
  });

  // ==========================================================================
  // Unit Conversion Edge Cases
  // ==========================================================================
  describe('unit conversion edge cases', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('handles zero duration tracks', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks) {
        expect(typeof track.duration).toBe('number');
        expect(track.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles zero tempo tracks', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks) {
        expect(typeof track.tempo).toBe('number');
        expect(track.tempo).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles tracks with no rating', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks) {
        expect(typeof track.rating).toBe('number');
        expect(track.rating).toBeGreaterThanOrEqual(0);
        expect(track.rating).toBeLessThanOrEqual(5);
      }
    });
  });

  // ==========================================================================
  // Connection Lifecycle
  // ==========================================================================
  describe('connection lifecycle', () => {
    it('can open multiple adapters to same database', () => {
      const adapter1 = new OneLibraryAdapter(TEST_DB_PATH);
      const adapter2 = new OneLibraryAdapter(TEST_DB_PATH);

      try {
        const tracks1 = adapter1.findAllTracks();
        const tracks2 = adapter2.findAllTracks();
        expect(tracks1.length).toBe(tracks2.length);
      } finally {
        adapter1.close();
        adapter2.close();
      }
    });

    it('operations fail after close', () => {
      const adapter = new OneLibraryAdapter(TEST_DB_PATH);
      adapter.close();

      expect(() => adapter.findAllTracks()).toThrow();
    });

    it('closing twice is safe', () => {
      const adapter = new OneLibraryAdapter(TEST_DB_PATH);
      adapter.close();

      // Second close should not throw
      expect(() => adapter.close()).not.toThrow();
    });
  });

  // ==========================================================================
  // Cue Point Edge Cases
  // ==========================================================================
  describe('cue point edge cases', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('cue offsets are non-negative', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks.slice(0, 10)) {
        const cues = adapter.findCues(track.id);
        for (const cue of cues) {
          expect(cue.offset).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('cue types are valid strings', () => {
      const validTypes = ['cue_point', 'loop', 'hot_cue', 'hot_loop'];
      const tracks = adapter.findAllTracks();
      for (const track of tracks.slice(0, 10)) {
        const cues = adapter.findCues(track.id);
        for (const cue of cues) {
          expect(validTypes).toContain(cue.type);
        }
      }
    });

    it('loop cues have valid length', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks.slice(0, 10)) {
        const cues = adapter.findCues(track.id);
        const loops = cues.filter(c => c.type === 'loop' || c.type === 'hot_loop');
        for (const loop of loops) {
          if ('length' in loop) {
            expect(loop.length).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    it('hot cue buttons are valid', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks.slice(0, 10)) {
        const cues = adapter.findCues(track.id);
        const hotCues = cues.filter(c => c.type === 'hot_cue' || c.type === 'hot_loop');
        for (const cue of hotCues) {
          if ('button' in cue) {
            expect(cue.button).toBeGreaterThan(0);
            expect(cue.button).toBeLessThanOrEqual(16);
          }
        }
      }
    });
  });

  // ==========================================================================
  // Relation Handling
  // ==========================================================================
  describe('relation handling', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('handles tracks with null artist', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks) {
        if (track.artist !== null) {
          expect(typeof track.artist.id).toBe('number');
          expect(typeof track.artist.name).toBe('string');
        }
      }
    });

    it('handles tracks with null album', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks) {
        if (track.album !== null) {
          expect(typeof track.album.id).toBe('number');
          expect(typeof track.album.name).toBe('string');
        }
      }
    });

    it('handles tracks with null genre', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks) {
        if (track.genre !== null) {
          expect(typeof track.genre.id).toBe('number');
          expect(typeof track.genre.name).toBe('string');
        }
      }
    });

    it('handles tracks with null key', () => {
      const tracks = adapter.findAllTracks();
      for (const track of tracks) {
        if (track.key !== null) {
          expect(typeof track.key.id).toBe('number');
          expect(typeof track.key.name).toBe('string');
        }
      }
    });
  });

  // ==========================================================================
  // Menu Configuration Edge Cases
  // ==========================================================================
  describe('menu configuration edge cases', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('findMenuItems returns valid structure', () => {
      const items = adapter.findMenuItems();
      expect(Array.isArray(items)).toBe(true);
      for (const item of items) {
        expect(typeof item.id).toBe('number');
        expect(typeof item.name).toBe('string');
        expect(typeof item.kind).toBe('number');
      }
    });

    it('findVisibleCategories returns valid structure', () => {
      const categories = adapter.findVisibleCategories();
      expect(Array.isArray(categories)).toBe(true);
      for (const cat of categories) {
        expect(typeof cat.id).toBe('number');
        expect(typeof cat.name).toBe('string');
      }
    });

    it('findVisibleSortOptions returns valid structure', () => {
      const sorts = adapter.findVisibleSortOptions();
      expect(Array.isArray(sorts)).toBe(true);
      for (const sort of sorts) {
        expect(typeof sort.id).toBe('number');
        expect(typeof sort.name).toBe('string');
        expect(typeof sort.kind).toBe('number');
      }
    });
  });

  // ==========================================================================
  // History Edge Cases
  // ==========================================================================
  describe('history edge cases', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('findHistorySessions returns valid structure', () => {
      const sessions = adapter.findHistorySessions();
      expect(Array.isArray(sessions)).toBe(true);
      for (const session of sessions) {
        expect(typeof session.id).toBe('number');
        expect(typeof session.name).toBe('string');
      }
    });

    it('history contents are track IDs', () => {
      const sessions = adapter.findHistorySessions().slice(0, 3);
      for (const session of sessions) {
        const trackIds = adapter.findHistoryContents(session.id);
        expect(Array.isArray(trackIds)).toBe(true);
        for (const id of trackIds) {
          expect(typeof id).toBe('number');
        }
      }
    });
  });

  // ==========================================================================
  // MyTag Edge Cases
  // ==========================================================================
  describe('myTag edge cases', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('findMyTags returns valid structure', () => {
      const result = adapter.findMyTags();
      expect(typeof result).toBe('object');
      expect(Array.isArray(result.folders)).toBe(true);
      expect(Array.isArray(result.tags)).toBe(true);

      for (const folder of result.folders) {
        expect(typeof folder.id).toBe('number');
        expect(typeof folder.name).toBe('string');
        expect(folder.isFolder).toBe(true);
      }

      for (const tag of result.tags) {
        expect(typeof tag.id).toBe('number');
        expect(typeof tag.name).toBe('string');
        expect(tag.isFolder).toBe(false);
      }
    });

    it('myTag contents are track IDs', () => {
      const result = adapter.findMyTags();
      const tags = result.tags.slice(0, 3);
      for (const tag of tags) {
        const trackIds = adapter.findMyTagContents(tag.id);
        expect(Array.isArray(trackIds)).toBe(true);
        for (const id of trackIds) {
          expect(typeof id).toBe('number');
        }
      }
    });

    it('track myTag lookup returns consistent results', () => {
      const tracks = adapter.findAllTracks().slice(0, 5);
      for (const track of tracks) {
        const tags1 = adapter.findMyTagsForTrack(track.id);
        const tags2 = adapter.findMyTagsForTrack(track.id);
        expect(tags1.length).toBe(tags2.length);
      }
    });
  });

  // ==========================================================================
  // Playlist Edge Cases
  // ==========================================================================
  describe('playlist edge cases', () => {
    let adapter: OneLibraryAdapter;

    beforeEach(() => {
      adapter = new OneLibraryAdapter(TEST_DB_PATH);
    });

    afterEach(() => {
      adapter.close();
    });

    it('findPlaylist returns valid structure', () => {
      const result = adapter.findPlaylist();
      expect(typeof result).toBe('object');
      expect(Array.isArray(result.folders)).toBe(true);
      expect(Array.isArray(result.playlists)).toBe(true);
      expect(Array.isArray(result.trackEntries)).toBe(true);
    });

    it('playlist contents are track IDs', () => {
      const result = adapter.findPlaylist();
      const playlists = result.playlists.slice(0, 3);
      for (const playlist of playlists) {
        const trackIds = adapter.findPlaylistContents(playlist.id);
        expect(Array.isArray(trackIds)).toBe(true);
        for (const id of trackIds) {
          expect(typeof id).toBe('number');
        }
      }
    });

    it('folders are marked as isFolder', () => {
      const result = adapter.findPlaylist();
      for (const folder of result.folders) {
        expect(folder.isFolder).toBe(true);
      }
    });

    it('playlists are not marked as isFolder', () => {
      const result = adapter.findPlaylist();
      for (const playlist of result.playlists) {
        expect(playlist.isFolder).toBe(false);
      }
    });
  });
});
