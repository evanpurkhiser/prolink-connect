// Connect to a Pioneer-style host and list every NFS export it advertises.
//
// Usage:  IFACE=lan0 [TARGET=10.0.0.119] pnpm exec tsx scripts/list-exports.ts
import {getExports, makeProgramClient} from 'src/nfs/programs';
import {RpcConnection} from 'src/nfs/rpc';
import {mount} from 'src/nfs/xdr';

const TARGET = process.argv[2] ?? process.env.TARGET;
if (!TARGET) {
  console.error('usage: TARGET=<ip> tsx scripts/list-exports.ts');
  process.exit(1);
}

const conn = new RpcConnection(TARGET, {transactionTimeout: 1500, retries: 2});
const mountClient = await makeProgramClient(conn, {
  id: mount.Program,
  version: mount.Version,
});
const exports = await getExports(mountClient);
console.log(`exports advertised by ${TARGET}:`);
for (const e of exports) {
  console.log(`  ${e.filesystem}\tgroups=${JSON.stringify(e.groups)}`);
}
await conn.disconnect();
