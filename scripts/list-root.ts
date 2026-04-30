// Recursively walk an NFS export on a Pioneer-style host. Implements NFSv2
// READDIR (procedure 16) directly. Filenames are decoded as UTF-16LE
// (Pioneer's nonstandard variant of NFSv2).
//
// Usage:  pnpm exec tsx scripts/list-root.ts [target_ip] [start_path] [max_depth]
import {
  getExports,
  lookupFile,
  makeProgramClient,
  mountFilesystem,
} from 'src/nfs/programs';
import {RpcConnection} from 'src/nfs/rpc';
import {mount, nfs} from 'src/nfs/xdr';

const TARGET = process.argv[2] ?? process.env.TARGET ?? '10.0.0.119';
const START_PATH = process.argv[3] ?? '';
const MAX_DEPTH = Number(process.argv[4] ?? 3);

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
console.log(`exports: ${exports.map(e => e.filesystem).join(', ')}`);

const root = await mountFilesystem(mountClient, exports[0]);
console.log(`mounted ${exports[0].filesystem}, root handle = ${root.toString('hex')}`);

const buildReadDirArgs = (handle: Buffer, cookie: Buffer, count: number) => {
  const buf = Buffer.alloc(32 + 8 + 4);
  handle.copy(buf, 0, 0, 32);
  cookie.copy(buf, 32, 0, 8);
  buf.writeUInt32BE(count, 40);
  return buf;
};

const decodeReadDirReply = (data: Buffer) => {
  // status: NFS3_OK == 0
  let off = 0;
  const status = data.readUInt32BE(off);
  off += 4;
  if (status !== 0) {
    throw new Error(`readdir status=${status}`);
  }
  const entries: Array<{fileid: number; name: string; cookie: Buffer}> = [];
  while (data.readUInt32BE(off) === 1) {
    off += 4; // value-follows
    const fileid = data.readUInt32BE(off);
    off += 4;
    const nameLen = data.readUInt32BE(off);
    off += 4;
    const padded = (nameLen + 3) & ~3;
    const nameBuf = data.subarray(off, off + nameLen);
    off += padded;
    const cookie = data.subarray(off, off + 8);
    off += 8;
    entries.push({fileid, name: nameBuf.toString('utf16le'), cookie: Buffer.from(cookie)});
  }
  off += 4; // value-follows = 0
  const eof = data.readUInt32BE(off) !== 0;
  return {entries, eof};
};

async function readDir(handle: Buffer): Promise<Array<{name: string; fileid: number}>> {
  let cookie: Buffer = Buffer.alloc(8);
  const all: Array<{name: string; fileid: number}> = [];
  while (true) {
    const args = buildReadDirArgs(handle, cookie, 8192);
    const resp = await nfsClient.call({procedure: 16, data: args});
    const {entries, eof} = decodeReadDirReply(resp);
    for (const e of entries) {
      all.push({name: e.name, fileid: e.fileid});
    }
    if (eof || entries.length === 0) break;
    cookie = Buffer.from(entries[entries.length - 1].cookie);
  }
  return all;
}

async function walk(prefix: string, handle: Buffer, depth: number) {
  const entries = await readDir(handle);
  for (const e of entries) {
    if (e.name === '.' || e.name === '..') continue;
    let info;
    try {
      info = await lookupFile(nfsClient, handle, e.name);
    } catch {
      console.log(`${prefix}${e.name}\t<lookup failed>`);
      continue;
    }
    const fullPath = `${prefix}${e.name}`;
    console.log(
      `${fullPath}\t${info.type}\tsize=${info.size}`,
    );
    if (info.type === 'directory' && depth < MAX_DEPTH) {
      await walk(`${fullPath}/`, info.handle, depth + 1);
    }
  }
}

let startHandle: Buffer = root;
let prefix = '';
if (START_PATH) {
  for (const part of START_PATH.split('/').filter(Boolean)) {
    const info = await lookupFile(nfsClient, startHandle, part);
    startHandle = info.handle;
    prefix += `${part}/`;
  }
}
await walk(prefix, startHandle, 0);
await conn.disconnect();
