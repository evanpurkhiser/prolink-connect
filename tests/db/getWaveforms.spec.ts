jest.mock('src/localdb/rekordbox', () => ({loadAnlz: jest.fn()}));
jest.mock('src/localdb', () => jest.fn());
jest.mock('onelibrary-connect', () => ({
  OneLibraryAdapter: jest.fn(),
  CueColor: {},
  HotcueButton: {},
}));

import {viaRemote} from 'src/db/getWaveforms';
import {MediaSlot, TrackType} from 'src/types';

const mockWaveformHd = [{type: 0, height: 10, color: 'blue'}];
const mockWaveformPreview = [{height: 4, whiteness: 0.5}];
const mockWaveformDetailed = [{height: 8, whiteness: 0.2}];

function makeConn() {
  return {
    query: jest.fn((opts: any) => {
      if (opts.query === 0x2c04) return Promise.resolve(mockWaveformHd);      // GetWaveformHD
      if (opts.query === 0x2004) return Promise.resolve(mockWaveformPreview); // GetWaveformPreview
      if (opts.query === 0x2904) return Promise.resolve(mockWaveformDetailed); // GetWaveformDetailed
      return Promise.resolve(null);
    }),
  };
}

function makeRemote(conn: any) {
  return {get: jest.fn().mockResolvedValue(conn)} as any;
}

function makeTrack(id = 197) {
  return {id} as any;
}

function makeOpts(trackType: TrackType, extra = {}) {
  return {
    deviceId: 1,
    trackSlot: MediaSlot.USB,
    trackType,
    track: makeTrack(),
    span: undefined,
    ...extra,
  } as any;
}

describe('getWaveforms.viaRemote', () => {
  describe('non-streaming tracks', () => {
    it('returns only waveformHd', async () => {
      const conn = makeConn();
      const result = await viaRemote(makeRemote(conn), makeOpts(TrackType.RB));

      expect(result).toEqual({waveformHd: mockWaveformHd});
      expect(result).not.toHaveProperty('waveformPreview');
      expect(result).not.toHaveProperty('waveformDetailed');
    });

    it('queries only GetWaveformHD', async () => {
      const conn = makeConn();
      await viaRemote(makeRemote(conn), makeOpts(TrackType.RB));

      const queries = conn.query.mock.calls.map((c: any) => c[0].query);
      expect(queries).toEqual([0x2c04]);
    });

    it('returns null when device has no remote db', async () => {
      const result = await viaRemote(makeRemote(null), makeOpts(TrackType.RB));
      expect(result).toBeNull();
    });
  });

  describe('streaming tracks', () => {
    it('returns waveformHd, waveformPreview, and waveformDetailed', async () => {
      const conn = makeConn();
      const result = await viaRemote(makeRemote(conn), makeOpts(TrackType.Streaming));

      expect(result).toEqual({
        waveformHd: mockWaveformHd,
        waveformPreview: mockWaveformPreview,
        waveformDetailed: mockWaveformDetailed,
      });
    });

    it('queries GetWaveformHD, GetWaveformPreview, and GetWaveformDetailed', async () => {
      const conn = makeConn();
      await viaRemote(makeRemote(conn), makeOpts(TrackType.Streaming));

      const queries = conn.query.mock.calls.map((c: any) => c[0].query);
      expect(queries).toContain(0x2c04); // GetWaveformHD
      expect(queries).toContain(0x2004); // GetWaveformPreview
      expect(queries).toContain(0x2904); // GetWaveformDetailed
      expect(queries).toHaveLength(3);
    });

    it('fetches preview and detailed in parallel', async () => {
      const order: number[] = [];
      const conn = {
        query: jest.fn((opts: any) => {
          order.push(opts.query);
          return Promise.resolve(opts.query === 0x2c04 ? mockWaveformHd
            : opts.query === 0x2004 ? mockWaveformPreview
            : mockWaveformDetailed);
        }),
      };

      await viaRemote(makeRemote(conn), makeOpts(TrackType.Streaming));

      // HD is first, then preview and detailed (order within parallel may vary)
      expect(order[0]).toBe(0x2c04);
      expect(order.slice(1).sort()).toEqual([0x2004, 0x2904].sort());
    });

    it('passes correct trackId to all queries', async () => {
      const conn = makeConn();
      const track = makeTrack(23315459);
      await viaRemote(makeRemote(conn), makeOpts(TrackType.Streaming, {track}));

      for (const call of conn.query.mock.calls) {
        expect((call[0] as any).args.trackId).toBe(23315459);
      }
    });

    it('returns null when device has no remote db', async () => {
      const result = await viaRemote(makeRemote(null), makeOpts(TrackType.Streaming));
      expect(result).toBeNull();
    });
  });
});
