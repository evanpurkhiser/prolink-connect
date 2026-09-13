jest.mock('src/localdb', () => jest.fn());
jest.mock('onelibrary-connect', () => ({
  OneLibraryAdapter: jest.fn(),
  CueColor: {},
  HotcueButton: {},
}));

import {viaLocal} from 'src/db/getPlaylist';
import {MediaSlot} from 'src/types';

/**
 * A database adapter holding two tracks and one playlist whose entries are
 * numbered independently of the tracks they reference (entry ids 1 and 2
 * point at tracks 20 and 10), the shape both the pdb ORM and the OneLibrary
 * adapter produce.
 */
function makeAdapter() {
  const tracks: Record<number, any> = {
    10: {id: 10, title: 'Ten'},
    20: {id: 20, title: 'Twenty'},
  };

  return {
    type: 'pdb',
    findTrack: jest.fn((id: number) => tracks[id] ?? null),
    findPlaylist: jest.fn(() => ({
      folders: [],
      playlists: [],
      trackEntries: [
        {id: 1, sortIndex: 0, playlistId: 5, trackId: 20},
        {id: 2, sortIndex: 1, playlistId: 5, trackId: 10},
      ],
    })),
    close: jest.fn(),
  };
}

function makeLocal(adapter: any) {
  return {get: jest.fn(() => Promise.resolve(adapter))} as any;
}

describe('getPlaylist.viaLocal', () => {
  it('resolves playlist entries through their trackId', async () => {
    const adapter = makeAdapter();

    const contents = await viaLocal(makeLocal(adapter), {
      deviceId: 2,
      mediaSlot: MediaSlot.USB,
      playlist: {id: 5, name: 'Set', isFolder: false, parentId: null},
    });

    expect(contents).not.toBeNull();
    expect(contents!.totalTracks).toBe(2);

    const titles: string[] = [];
    for await (const track of contents!.tracks) {
      titles.push(track.title);
    }

    expect(titles).toEqual(['Twenty', 'Ten']);
    expect(adapter.findTrack).toHaveBeenNthCalledWith(1, 20);
    expect(adapter.findTrack).toHaveBeenNthCalledWith(2, 10);
  });

  it('returns null when the slot has no database', async () => {
    const contents = await viaLocal(makeLocal(null), {
      deviceId: 2,
      mediaSlot: MediaSlot.SD,
    });

    expect(contents).toBeNull();
  });

  it('rejects slots that cannot hold a rekordbox database', async () => {
    await expect(
      viaLocal(makeLocal(makeAdapter()), {deviceId: 2, mediaSlot: MediaSlot.RB})
    ).rejects.toThrow('Expected USB or SD slot');
  });
});
