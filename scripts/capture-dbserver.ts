// Capture the dbserver TCP exchange. The lib first queries the
// well-known port 12523 to discover the actual dbserver port, then opens a
// second TCP connection to that port and sends the five-byte greeting. Both
// exchanges are fixture-worthy for src/remotedb/.
//
// Output is NDJSON, one record per TCP message direction:
//   {phase, port, dir: "send"|"recv", bytes: <base64>}
//
// Usage:  CAPTURE_OUT=tests/_fixtures/dbserver-rekordbox.ndjson \
//         TARGET=10.0.0.119 \
//         pnpm exec tsx scripts/capture-dbserver.ts
import {writeFileSync} from 'node:fs';
import net from 'node:net';

const TARGET = process.env.TARGET ?? process.argv[2] ?? '10.0.0.119';
const OUT = process.env.CAPTURE_OUT ?? './dbserver-capture.ndjson';
const QUERY_PORT = 12523;

interface Entry {
  phase: string;
  port: number;
  dir: 'send' | 'recv';
  bytes: string;
}
const records: Entry[] = [];

const collectOnce = (host: string, port: number, payload: Buffer, phase: string) =>
  new Promise<Buffer>((resolve, reject) => {
    const sock = net.createConnection({host, port});
    const chunks: Buffer[] = [];
    sock.setTimeout(2000);
    sock.on('connect', () => {
      records.push({phase, port, dir: 'send', bytes: payload.toString('base64')});
      sock.write(payload);
    });
    sock.on('data', d => chunks.push(d));
    sock.on('timeout', () => {
      sock.destroy();
      const buf = Buffer.concat(chunks);
      records.push({phase, port, dir: 'recv', bytes: buf.toString('base64')});
      resolve(buf);
    });
    sock.on('end', () => {
      const buf = Buffer.concat(chunks);
      records.push({phase, port, dir: 'recv', bytes: buf.toString('base64')});
      resolve(buf);
    });
    sock.on('error', reject);
  });

console.log(`Capturing dbserver against ${TARGET} → ${OUT}`);

// 1) Port discovery. Magic request: u32 length(=0x0f) + "RemoteDBServer\0".
const portQuery = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x0f]),
  Buffer.from('RemoteDBServer\0', 'ascii'),
]);
const portReply = await collectOnce(TARGET, QUERY_PORT, portQuery, 'dbserver-port-query');
if (portReply.length !== 2) {
  console.error(`expected 2-byte reply, got ${portReply.length}b`);
  writeFileSync(OUT, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  process.exit(1);
}
const dbPort = portReply.readUInt16BE();
console.log(`dbserver port = ${dbPort}`);

// 2) Initial setup packet (per dysentery analysis): the five bytes
//    11 00 00 00 01 should echo back unchanged.
const setupPkt = Buffer.from([0x11, 0x00, 0x00, 0x00, 0x01]);
await collectOnce(TARGET, dbPort, setupPkt, 'dbserver-setup-greeting');

writeFileSync(OUT, records.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`Wrote ${records.length} TCP records to ${OUT}`);
