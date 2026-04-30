/**
 * Regression tests for the NFS RPC stack, driven by a wire-trace fixture
 * captured against a real Rekordbox session. Each test feeds a slice of the
 * fixture through a fake socket and asserts the lib decodes / orchestrates
 * the exchange correctly.
 *
 * Refresh the fixture with `pnpm exec tsx scripts/capture-nfs.ts` whenever
 * the wire format intentionally changes.
 */
import {Socket} from 'node:dgram';
import {beforeEach, describe, expect, it} from 'vitest';

import {
  fetchFile,
  getExports,
  lookupFile,
  lookupPath,
  makeProgramClient,
  mountFilesystem,
} from 'src/nfs/programs';
import {RpcConnection} from 'src/nfs/rpc';
import {mount, nfs} from 'src/nfs/xdr';

import {FakeRpcSocket, loadWireTrace, WireRecord} from '../_helpers/nfs-replay';

const TARGET = '10.0.0.119';
const FAST_RETRY = {transactionTimeout: 50, retries: 0};

const allRecords: WireRecord[] = loadWireTrace('nfs-rekordbox.ndjson');

const recordsForPhases = (...phases: string[]): WireRecord[] =>
  allRecords.filter(r => phases.some(p => r.phase.startsWith(p)));

const newConn = (records: WireRecord[]) => {
  const socket = new FakeRpcSocket(records);
  const conn = new RpcConnection(TARGET, FAST_RETRY, socket as unknown as Socket);
  return {conn, socket};
};

describe('NFS replay against captured Rekordbox session', () => {
  describe('portmap auto-discovery', () => {
    let conn: RpcConnection;
    let socket: FakeRpcSocket;

    beforeEach(() => {
      ({conn, socket} = newConn(
        recordsForPhases('portmap-discovery+mount-getport', 'portmap nfs-getport'),
      ));
    });

    it('skips the macOS rpcbind on 111 and locks onto 2049', async () => {
      const mountClient = await makeProgramClient(conn, {
        id: mount.Program,
        version: mount.Version,
      });

      // First send was the discovery probe at 111 (system rpcbind, port=0).
      // Second was the discovery probe at 2049 (real Rekordbox portmap).
      // Third was the mount-getport call against the discovered portmap.
      expect(socket.sends.map(s => s.port)).toEqual([111, 2049, 2049]);
      expect(conn.portmapPort).toBe(2049);
      expect(mountClient.port).toBe(63612);
    });

    it('caches the discovered portmap port across additional clients', async () => {
      await makeProgramClient(conn, {id: mount.Program, version: mount.Version});
      const nfsClient = await makeProgramClient(conn, {
        id: nfs.Program,
        version: nfs.Version,
      });

      // The second makeProgramClient should NOT re-run discovery — only one
      // additional getport call against the cached portmap port.
      expect(socket.sends.map(s => s.port)).toEqual([111, 2049, 2049, 2049]);
      expect(nfsClient.port).toBe(2049);
    });
  });

  describe('mount protocol', () => {
    it('decodes the export list', async () => {
      const {conn} = newConn(recordsForPhases('mount-export-list'));
      const mountClient = {
        call: (data: {procedure: number; data: Buffer}) =>
          conn.call({...data, port: 63612, program: mount.Program, version: mount.Version}),
      } as Parameters<typeof getExports>[0];

      const exports = await getExports(mountClient);
      expect(exports).toEqual([
        {filesystem: '/', groups: ['10.0.0.119/255.255.255.0']},
      ]);
    });

    it('parses the root file handle from MNT', async () => {
      const {conn} = newConn(recordsForPhases('mount-mnt-root'));
      const mountClient = {
        call: (data: {procedure: number; data: Buffer}) =>
          conn.call({...data, port: 63612, program: mount.Program, version: mount.Version}),
      } as Parameters<typeof mountFilesystem>[0];

      const handle = await mountFilesystem(mountClient, {
        filesystem: '/',
        groups: ['10.0.0.119/255.255.255.0'],
      });

      expect(handle).toBeInstanceOf(Buffer);
      expect(handle.length).toBe(32);
      // Rekordbox returns an all-zero handle for the export root; this
      // assertion documents the (initially surprising) protocol behavior.
      expect(handle.equals(Buffer.alloc(32))).toBe(true);
    });
  });

  describe('NFS lookup', () => {
    const root = Buffer.alloc(32);
    const nfsCallable = (conn: RpcConnection) =>
      ({
        call: (data: {procedure: number; data: Buffer}) =>
          conn.call({...data, port: 2049, program: nfs.Program, version: nfs.Version}),
      }) as Parameters<typeof lookupFile>[0];

    it('decodes a positive lookup', async () => {
      const {conn} = newConn(recordsForPhases('lookup-positive'));
      const info = await lookupFile(nfsCallable(conn), root, 'Library');
      expect(info.type).toBe('directory');
      expect(info.size).toBe(2208);
      expect(info.name).toBe('Library');
      expect(info.handle.length).toBe(32);
    });

    it('throws on a negative lookup (NFSERR_NOENT)', async () => {
      const {conn} = newConn(
        recordsForPhases('lookup-negative (PIONEER at root)'),
      );
      await expect(
        lookupFile(nfsCallable(conn), root, 'PIONEER'),
      ).rejects.toThrow(/Failed file lookup of PIONEER/);
    });

    it('issues one RPC per path component when walking', async () => {
      const {conn, socket} = newConn(recordsForPhases('lookup-path-walk'));
      const info = await lookupPath(
        nfsCallable(conn),
        root,
        'Users/evan/Library/Pioneer/rekordbox',
      );
      expect(info.type).toBe('directory');
      expect(socket.sends).toHaveLength(5);
    });
  });

  describe('NFS read', () => {
    it('fetches a small file across as many chunks as needed', async () => {
      const {conn, socket} = newConn(
        recordsForPhases('read datafile.edb'),
      );
      const nfsCallable = {
        call: (data: {procedure: number; data: Buffer}) =>
          conn.call({...data, port: 2049, program: nfs.Program, version: nfs.Version}),
      } as Parameters<typeof fetchFile>[0];

      const data = await fetchFile(nfsCallable, {
        name: 'datafile.edb',
        handle: Buffer.alloc(32),
        size: 2864,
        type: 'regular',
      });

      expect(data).toBeInstanceOf(Buffer);
      expect(data.length).toBe(2864);
      // The capture exercises the multi-iteration read loop; assert that
      // both reads were issued.
      expect(socket.sends).toHaveLength(2);
    });

    it('paginates a large file and reports cumulative progress', async () => {
      const {conn, socket} = newConn(recordsForPhases('read master.db'));
      const nfsCallable = {
        call: (data: {procedure: number; data: Buffer}) =>
          conn.call({...data, port: 2049, program: nfs.Program, version: nfs.Version}),
      } as Parameters<typeof fetchFile>[0];

      const progress: number[] = [];
      const data = await fetchFile(
        nfsCallable,
        {
          name: 'master.db',
          handle: Buffer.alloc(32),
          size: 6 * 1024,
          type: 'regular',
        },
        p => progress.push(p.read),
      );

      expect(data.length).toBe(6 * 1024);
      // Three chunks → three progress callbacks → three RPCs.
      expect(socket.sends).toHaveLength(3);
      expect(progress).toHaveLength(3);
      expect(progress[progress.length - 1]).toBe(6 * 1024);
    });
  });
});
