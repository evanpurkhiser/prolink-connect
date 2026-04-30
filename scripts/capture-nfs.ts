// Capture raw NFS wire traffic from a real Pioneer-style host so we can
// build deterministic test fixtures without having to talk to the network.
//
// Drives the lib through every call shape we'd want regression coverage for:
//   - portmap discovery against both 111 (the macOS rpcbind that doesn't
//     actually have NFS) and 2049 (Rekordbox's embedded portmap)
//   - mount EXPORT
//   - mount MNT
//   - lookup of a name that exists at root
//   - lookup of a name that doesn't exist (negative case)
//   - walking a multi-component path
//   - reading a small file (single READ chunk)
//   - reading a larger file (multi-chunk pagination)
//
// Output is NDJSON, one record per RPC transaction, containing the raw sent
// and received bytes (base64). We deliberately do not normalize xid or any
// other field — the replay layer can decide how much it wants to mutate.
//
// Usage:  CAPTURE_OUT=tests/_fixtures/nfs-rekordbox.ndjson \
//         TARGET=10.0.0.119 \
//         RB_USER=evan \
//         pnpm exec tsx scripts/capture-nfs.ts
import {writeFileSync} from 'node:fs';

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

const TARGET = process.env.TARGET ?? process.argv[2] ?? '10.0.0.119';
const RB_USER = process.env.RB_USER ?? process.argv[3] ?? 'evan';
const OUT = process.env.CAPTURE_OUT ?? './nfs-capture.ndjson';

interface Entry {
  phase: string;
  port: number;
  sent: string;
  received?: string;
  error?: string;
}

const records: Entry[] = [];
let currentPhase = 'unknown';

const conn = new RpcConnection(TARGET, {transactionTimeout: 1500, retries: 1});
conn.wireTap = ({port, sent, received, error}) => {
  records.push({
    phase: currentPhase,
    port,
    sent: sent.toString('base64'),
    ...(received && {received: received.toString('base64')}),
    ...(error && {error}),
  });
};

const phase = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
  currentPhase = label;
  console.log(`[phase] ${label}`);
  try {
    const result = await fn();
    return result;
  } catch (err) {
    console.log(`  → threw: ${(err as Error).message}`);
    return undefined;
  }
};

console.log(`Capturing against ${TARGET}, user=${RB_USER} → ${OUT}`);

// Portmap discovery exercises both 111 (macOS rpcbind, returns port=0) and
// 2049 (Rekordbox embedded portmap).
const mountClient = await phase('portmap-discovery+mount-getport', () =>
  makeProgramClient(conn, {id: mount.Program, version: mount.Version}),
);
const nfsClient = await phase('portmap nfs-getport', () =>
  makeProgramClient(conn, {id: nfs.Program, version: nfs.Version}),
);

if (!mountClient || !nfsClient) {
  writeFileSync(OUT, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  console.error('aborting — could not establish RPC clients');
  process.exit(1);
}

const exports = await phase('mount-export-list', () => getExports(mountClient));
if (!exports?.length) {
  console.error('aborting — no exports advertised');
  process.exit(1);
}

const root = await phase('mount-mnt-root', () => mountFilesystem(mountClient, exports[0]));
if (!root) process.exit(1);

await phase('lookup-positive (Library at root)', () =>
  lookupFile(nfsClient, root, 'Library'),
);

await phase('lookup-negative (PIONEER at root)', () =>
  lookupFile(nfsClient, root, 'PIONEER'),
);

await phase('lookup-negative (.PIONEER at root)', () =>
  lookupFile(nfsClient, root, '.PIONEER'),
);

const rbPath = `Users/${RB_USER}/Library/Pioneer/rekordbox`;
const rbDir = await phase(`lookup-path-walk (${rbPath})`, () =>
  lookupPath(nfsClient, root, rbPath),
);

if (rbDir) {
  await phase('lookup-negative (nonexistent.bin)', () =>
    lookupFile(nfsClient, rbDir.handle, 'nonexistent.bin'),
  );

  const small = await phase(`lookup datafile.edb (small)`, () =>
    lookupFile(nfsClient, rbDir.handle, 'datafile.edb'),
  );

  if (small) {
    await phase(`read datafile.edb (full file, ${small.size}B)`, () =>
      fetchFile(nfsClient, small),
    );
  }

  // master.db is ~39MB; capture only the first chunk so the fixture stays
  // tractable. We do this by looking up + a partial read sequence.
  const big = await phase('lookup master.db (large)', () =>
    lookupFile(nfsClient, rbDir.handle, 'master.db'),
  );
  if (big) {
    await phase('read master.db (first 6KB → multi-chunk)', async () => {
      // Hand-call read with truncated size to capture exactly 3 chunks.
      const truncated = {...big, size: 6 * 1024};
      return fetchFile(nfsClient, truncated);
    });
  }
}

writeFileSync(OUT, records.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`\nWrote ${records.length} RPC transactions to ${OUT}`);
await conn.disconnect();
