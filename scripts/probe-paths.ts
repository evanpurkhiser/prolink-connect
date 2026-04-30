// Try a bunch of candidate filenames at the root of an NFS export to see
// which (if any) Rekordbox actually exposes. Since the readdir came back
// empty, this attacks the problem from the other direction.
//
// Usage:  pnpm exec tsx scripts/probe-paths.ts [target_ip]
import {
  getExports,
  lookupFile,
  makeProgramClient,
  mountFilesystem,
} from 'src/nfs/programs';
import {RpcConnection} from 'src/nfs/rpc';
import {mount, nfs} from 'src/nfs/xdr';

const TARGET = process.argv[2] ?? process.env.TARGET ?? '10.0.0.119';

const conn = new RpcConnection(TARGET, {transactionTimeout: 1500, retries: 2});
const mountClient = await makeProgramClient(conn, {
  id: mount.Program,
  version: mount.Version,
});
const nfsClient = await makeProgramClient(conn, {
  id: nfs.Program,
  version: nfs.Version,
});

const exports = await getExports(mountClient);
const root = await mountFilesystem(mountClient, exports[0]);
console.log(`mounted ${exports[0].filesystem}, handle=${root.toString('hex')}\n`);

const tryAt = async (handle: Buffer, dir: string, names: string[]) => {
  console.log(`--- in ${dir || '/'} ---`);
  for (const name of names) {
    try {
      const info = await lookupFile(nfsClient, handle, name);
      console.log(
        `  ✓ ${JSON.stringify(name)}\t${info.type}\tsize=${info.size}\thandle=${info.handle.toString('hex').slice(0, 24)}`,
      );
      if (info.type === 'directory') {
        // Surface that we can recurse here.
      }
    } catch (err) {
      // Skip negative hits to keep output tight.
    }
  }
};

await tryAt(root, '', [
  'PIONEER', '.PIONEER', 'rekordbox', '.rekordbox', 'Rekordbox',
  'export.pdb', 'master.db', 'database',
  'B', '/B', 'C', '/C',
  'Library', '.Library', 'Library/Pioneer',
  'collection', 'share', 'Music', 'Volumes', 'Users',
  '0', '1', '.',
  'Application Support',
]);

const lib = await lookupFile(nfsClient, root, 'Library');
const libDirs = [
  'Pioneer', 'pioneer', '.Pioneer',
  'rekordbox', '.rekordbox',
  'Application Support',
  'PIONEER', 'export.pdb', 'master.db',
  'Caches', 'Preferences',
];
await tryAt(lib.handle, 'Library/', libDirs);

try {
  const pioneer = await lookupFile(nfsClient, lib.handle, 'Pioneer');
  await tryAt(pioneer.handle, 'Library/Pioneer/', [
    'rekordbox', 'rekordbox6', 'Rekordbox', 'rekordbox-data',
    'export.pdb', 'master.db', 'share',
  ]);
  try {
    const rb = await lookupFile(nfsClient, pioneer.handle, 'rekordbox');
    await tryAt(rb.handle, 'Library/Pioneer/rekordbox/', [
      'export.pdb', 'master.db', 'share', 'option.xml',
      'rekordbox.xml', 'PIONEER', 'analysis',
    ]);
  } catch {}
} catch {}

try {
  const appSup = await lookupFile(nfsClient, lib.handle, 'Application Support');
  await tryAt(appSup.handle, 'Library/Application Support/', [
    'Pioneer', 'rekordbox', 'Rekordbox',
  ]);
} catch {}

const users = await lookupFile(nfsClient, root, 'Users');
const userCandidates = process.env.USERS?.split(',') ?? [
  'evan', 'evanpurkhiser', 'evanp', 'admin', 'user', 'Shared',
];
await tryAt(users.handle, 'Users/', userCandidates);

for (const username of userCandidates) {
  try {
    const u = await lookupFile(nfsClient, users.handle, username);
    if (u.type !== 'directory') continue;
    try {
      const ulib = await lookupFile(nfsClient, u.handle, 'Library');
      await tryAt(ulib.handle, `Users/${username}/Library/`, [
        'Pioneer', 'rekordbox', 'Application Support',
      ]);
      try {
        const pioneer = await lookupFile(nfsClient, ulib.handle, 'Pioneer');
        await tryAt(pioneer.handle, `Users/${username}/Library/Pioneer/`, [
          'rekordbox', 'rekordbox6', 'rekordbox7', 'export.pdb', 'master.db',
        ]);
        try {
          const rb = await lookupFile(nfsClient, pioneer.handle, 'rekordbox');
          await tryAt(rb.handle, `Users/${username}/Library/Pioneer/rekordbox/`, [
            'master.db', 'master.db-shm', 'master.db-wal',
            'export.pdb', 'PIONEER',
            'share', 'analysis', 'option.xml',
            'datafile.edb', 'datafile.idx',
            'rekordbox.xml',
          ]);
          try {
            const rbPioneer = await lookupFile(nfsClient, rb.handle, 'PIONEER');
            await tryAt(
              rbPioneer.handle,
              `Users/${username}/Library/Pioneer/rekordbox/PIONEER/`,
              ['rekordbox', 'export.pdb', 'data', 'USB'],
            );
            try {
              const rbPioneerRb = await lookupFile(nfsClient, rbPioneer.handle, 'rekordbox');
              await tryAt(
                rbPioneerRb.handle,
                `Users/${username}/Library/Pioneer/rekordbox/PIONEER/rekordbox/`,
                ['export.pdb', 'datafile.edb', 'export.dat', 'master.db'],
              );
            } catch {}
          } catch {}
        } catch {}
      } catch {}
    } catch {}
  } catch {}
}
await conn.disconnect();
