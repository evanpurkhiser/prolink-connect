/**
 * Unit tests for src/nfs/index.ts — the public NFS orchestration layer.
 *
 * The lower-level RPC primitives in `./programs` and `./rpc` are tested
 * elsewhere (see replay.spec.ts). Here we mock them out so we can exercise
 * the things this file is actually responsible for: per-device connection
 * caching, root-handle caching, slot-to-export mapping, and the retry on
 * stale-handle lookup failure.
 */
import * as ip from 'ip-address';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {Device, DeviceType, MediaSlot} from 'src/types';

vi.mock('@sentry/node', () => {
  const fakeSpan = {
    startChild: vi.fn(() => fakeSpan),
    setData: vi.fn(),
    setTag: vi.fn(),
    setStatus: vi.fn(),
    finish: vi.fn(),
  };
  return {
    startTransaction: vi.fn(() => fakeSpan),
    setTag: vi.fn(),
    captureException: vi.fn(),
  };
});

vi.mock('src/nfs/rpc', () => {
  // Constructor mock: `new RpcConnection(...)` must produce a real instance.
  const ctor = vi.fn(function (this: any, address: string, retryConfig: any) {
    this.address = address;
    this.retryConfig = retryConfig;
    this.connected = true;
    this.disconnect = vi.fn();
  }) as unknown as new (...args: any[]) => any;
  return {RpcConnection: ctor, RpcProgram: vi.fn()};
});

vi.mock('src/nfs/programs', () => ({
  makeProgramClient: vi.fn(),
  getExports: vi.fn(),
  mountFilesystem: vi.fn(),
  lookupPath: vi.fn(),
  fetchFile: vi.fn(),
}));

import {RpcConnection} from 'src/nfs/rpc';
import {
  fetchFile as fetchFileCall,
  getExports,
  lookupPath,
  makeProgramClient,
  mountFilesystem,
} from 'src/nfs/programs';

import {
  configureRetryStrategy,
  fetchFile,
  resetDeviceCache,
} from 'src/nfs/index';

const mockMakeProgramClient = vi.mocked(makeProgramClient);
const mockGetExports = vi.mocked(getExports);
const mockMountFilesystem = vi.mocked(mountFilesystem);
const mockLookupPath = vi.mocked(lookupPath);
const mockFetchFileCall = vi.mocked(fetchFileCall);
const MockRpcConnection = vi.mocked(RpcConnection);

const makeDevice = (extra?: Partial<Device>): Device => ({
  id: 1,
  type: DeviceType.CDJ,
  name: 'CDJ-test',
  ip: new ip.Address4('10.0.0.1'),
  macAddr: Uint8Array.of(0, 0, 0, 0, 0, 0),
  ...extra,
});

const makeFileInfo = (size = 1234) => ({
  name: 'export.pdb',
  handle: Buffer.alloc(32, 0xaa),
  size,
  type: 'regular' as const,
});

const makeFakeProgramClient = () => ({} as any);

describe('nfs/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Module-level caches survive across tests; reset for the address we use
    // so each test starts clean.
    resetDeviceCache(makeDevice());

    mockMakeProgramClient.mockResolvedValue(makeFakeProgramClient());
    mockMountFilesystem.mockResolvedValue(Buffer.alloc(32, 0xff));
    mockGetExports.mockResolvedValue([
      {filesystem: '/C/', groups: []},
      {filesystem: '/B/', groups: []},
      {filesystem: '/', groups: []},
    ]);
    mockLookupPath.mockResolvedValue(makeFileInfo());
    mockFetchFileCall.mockResolvedValue(Buffer.from('contents'));
  });

  describe('fetchFile', () => {
    it('opens a connection and returns the file contents on the happy path', async () => {
      const device = makeDevice();
      const data = await fetchFile({
        device,
        slot: MediaSlot.USB,
        path: 'PIONEER/rekordbox/export.pdb',
      });

      expect(data).toEqual(Buffer.from('contents'));
      expect(MockRpcConnection).toHaveBeenCalledTimes(1);
      expect(MockRpcConnection).toHaveBeenCalledWith(device.ip.address, {});
      // mountClient + nfsClient
      expect(mockMakeProgramClient).toHaveBeenCalledTimes(2);
      expect(mockLookupPath).toHaveBeenCalledTimes(1);
      expect(mockLookupPath).toHaveBeenCalledWith(
        expect.anything(),
        Buffer.alloc(32, 0xff),
        'PIONEER/rekordbox/export.pdb',
        expect.anything(),
      );
    });

    it('maps each MediaSlot to the corresponding export path', async () => {
      const device = makeDevice();

      for (const [slot, expected] of [
        [MediaSlot.USB, '/C/'],
        [MediaSlot.SD, '/B/'],
        [MediaSlot.RB, '/'],
      ] as const) {
        resetDeviceCache(device);
        await fetchFile({device, slot, path: 'foo'});
        expect(mockMountFilesystem).toHaveBeenLastCalledWith(
          expect.anything(),
          expect.objectContaining({filesystem: expected}),
          expect.anything(),
        );
      }
    });

    it('throws when the requested slot is not exported by the device', async () => {
      mockGetExports.mockResolvedValue([{filesystem: '/B/', groups: []}]);
      const device = makeDevice({id: 9});

      await expect(
        fetchFile({device, slot: MediaSlot.USB, path: 'foo'}),
      ).rejects.toThrow(/slot \(.*\) is not exported on Device 9/);
    });

    it('reuses the cached connection on subsequent calls to the same device', async () => {
      const device = makeDevice();
      await fetchFile({device, slot: MediaSlot.USB, path: 'a'});
      await fetchFile({device, slot: MediaSlot.USB, path: 'b'});

      // RpcConnection only constructed once.
      expect(MockRpcConnection).toHaveBeenCalledTimes(1);
      // Mount + NFS clients only created once.
      expect(mockMakeProgramClient).toHaveBeenCalledTimes(2);
      // Root handle was cached, so getExports/mount only happen once.
      expect(mockGetExports).toHaveBeenCalledTimes(1);
      expect(mockMountFilesystem).toHaveBeenCalledTimes(1);
      // Both paths were looked up.
      expect(mockLookupPath).toHaveBeenCalledTimes(2);
    });

    it('caches root handles per slot, not per path', async () => {
      const device = makeDevice();
      await fetchFile({device, slot: MediaSlot.USB, path: 'a'});
      await fetchFile({device, slot: MediaSlot.SD, path: 'b'});

      // Two slots → two mounts, but still only one connection.
      expect(MockRpcConnection).toHaveBeenCalledTimes(1);
      expect(mockMountFilesystem).toHaveBeenCalledTimes(2);
    });

    it('reconnects when the cached connection is no longer connected', async () => {
      const device = makeDevice();
      await fetchFile({device, slot: MediaSlot.USB, path: 'a'});

      // Simulate the cached connection going away.
      const firstConn = MockRpcConnection.mock.results[0].value;
      firstConn.connected = false;

      await fetchFile({device, slot: MediaSlot.USB, path: 'b'});

      expect(MockRpcConnection).toHaveBeenCalledTimes(2);
    });

    it('clears the root handle cache and retries once when lookupPath fails', async () => {
      const device = makeDevice();
      const firstHandle = Buffer.alloc(32, 0xff);
      const secondHandle = Buffer.alloc(32, 0x33);

      mockMountFilesystem
        .mockResolvedValueOnce(firstHandle)
        .mockResolvedValueOnce(secondHandle);

      mockLookupPath
        .mockRejectedValueOnce(new Error('stale handle'))
        .mockResolvedValueOnce(makeFileInfo());

      const data = await fetchFile({
        device,
        slot: MediaSlot.USB,
        path: 'foo',
      });

      expect(data).toEqual(Buffer.from('contents'));
      // Two lookup attempts.
      expect(mockLookupPath).toHaveBeenCalledTimes(2);
      // Second attempt used the *new* root handle, not the stale one.
      expect(mockLookupPath).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        secondHandle,
        'foo',
        expect.anything(),
      );
      // The retry triggered a re-mount.
      expect(mockMountFilesystem).toHaveBeenCalledTimes(2);
    });

    it('does not retry indefinitely — propagates the second lookup failure', async () => {
      const device = makeDevice();
      mockLookupPath.mockRejectedValue(new Error('still bad'));

      await expect(
        fetchFile({device, slot: MediaSlot.USB, path: 'foo'}),
      ).rejects.toThrow('still bad');
      expect(mockLookupPath).toHaveBeenCalledTimes(2);
    });

    it('throws if the slot stops being exported during the retry', async () => {
      const device = makeDevice({id: 7});
      mockLookupPath.mockRejectedValueOnce(new Error('stale'));
      // First getExports succeeded with all three; on retry the slot is gone.
      mockGetExports.mockResolvedValueOnce([
        {filesystem: '/C/', groups: []},
        {filesystem: '/B/', groups: []},
        {filesystem: '/', groups: []},
      ]);
      mockGetExports.mockResolvedValueOnce([{filesystem: '/B/', groups: []}]);

      await expect(
        fetchFile({device, slot: MediaSlot.USB, path: 'foo'}),
      ).rejects.toThrow(/slot \(.*\) is not exported on Device 7/);
    });

    it('forwards the onProgress callback through to the read loop', async () => {
      const device = makeDevice();
      const onProgress = vi.fn();
      await fetchFile({device, slot: MediaSlot.USB, path: 'a', onProgress});

      expect(mockFetchFileCall).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({name: 'export.pdb'}),
        onProgress,
        expect.anything(),
      );
    });
  });

  describe('resetDeviceCache', () => {
    it('forces a fresh connection on the next fetch', async () => {
      const device = makeDevice();
      await fetchFile({device, slot: MediaSlot.USB, path: 'a'});
      resetDeviceCache(device);
      await fetchFile({device, slot: MediaSlot.USB, path: 'b'});

      expect(MockRpcConnection).toHaveBeenCalledTimes(2);
      expect(mockMountFilesystem).toHaveBeenCalledTimes(2);
    });
  });

  describe('configureRetryStrategy', () => {
    it('applies the new config to subsequent connections', async () => {
      configureRetryStrategy({retries: 7});
      await fetchFile({device: makeDevice(), slot: MediaSlot.USB, path: 'a'});

      expect(MockRpcConnection).toHaveBeenLastCalledWith(
        expect.any(String),
        {retries: 7},
      );

      // Reset to the module default for downstream tests.
      configureRetryStrategy({});
    });

    it('updates the retryConfig of already-cached connections', async () => {
      configureRetryStrategy({});
      const device = makeDevice();
      await fetchFile({device, slot: MediaSlot.USB, path: 'a'});

      const conn = MockRpcConnection.mock.results[0].value;
      configureRetryStrategy({retries: 3});

      expect(conn.retryConfig).toEqual({retries: 3});
      configureRetryStrategy({});
    });
  });
});
