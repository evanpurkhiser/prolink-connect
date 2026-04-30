// Minimal standalone "fake CDJ" announcer.
//
// Broadcasts a single announce packet onto the LAN every 1500ms so Rekordbox
// (or any other prolink-aware listener) sees us without us first having to
// see them. No library imports, no deviceManager — just a UDP broadcast loop.
//
// Usage:
//   IFACE=lan0 [VCDJ_ID=5] node scripts/announce-only.mjs
import dgram from 'node:dgram';
import {networkInterfaces} from 'node:os';

const IFACE = process.env.IFACE;
const VCDJ_ID = Number(process.env.VCDJ_ID ?? 5);
const ANNOUNCE_PORT = 50000;
const ANNOUNCE_INTERVAL_MS = 1500;

if (!IFACE) {
  console.error('IFACE env var is required (e.g. IFACE=lan0).');
  console.error('Available IPv4 interfaces:');
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.family === 'IPv4' && !i.internal) {
        console.error(`  ${name.padEnd(16)} ${i.cidr}`);
      }
    }
  }
  process.exit(1);
}

const v4 = (networkInterfaces()[IFACE] ?? []).find(
  i => i.family === 'IPv4' && !i.internal,
);
if (!v4) {
  console.error(`Interface "${IFACE}" has no external IPv4 address.`);
  process.exit(1);
}

if (!Number.isInteger(VCDJ_ID) || VCDJ_ID < 1 || VCDJ_ID > 6) {
  console.error(`VCDJ_ID must be in [1, 6] (got ${process.env.VCDJ_ID}).`);
  process.exit(1);
}

const ipToBytes = ip => Uint8Array.from(ip.split('.').map(Number));
const macToBytes = mac => Uint8Array.from(mac.split(':').map(s => parseInt(s, 16)));

const broadcastAddress = cidr => {
  const [addr, prefix] = cidr.split('/');
  const a = ipToBytes(addr);
  const bits = Number(prefix);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const addrInt = ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
  const bcast = (addrInt | (~mask >>> 0)) >>> 0;
  return [
    (bcast >>> 24) & 0xff,
    (bcast >>> 16) & 0xff,
    (bcast >>> 8) & 0xff,
    bcast & 0xff,
  ].join('.');
};

// Header that prefixes every packet on the prolink network.
const PROLINK_HEADER = Uint8Array.of(
  0x51,
  0x73,
  0x70,
  0x74,
  0x31,
  0x57,
  0x6d,
  0x4a,
  0x4f,
  0x4c,
);

const VIRTUAL_CDJ_NAME = 'prolink-typescript';
const DEVICE_TYPE_CDJ = 0x01;

const buildAnnouncePacket = ({id, ipBytes, macBytes, name}) => {
  const nameBytes = new Uint8Array(20);
  nameBytes.set(Buffer.from(name, 'ascii'));

  return Uint8Array.from([
    ...PROLINK_HEADER,
    0x06,
    0x00, // 0x0a: announce type
    ...nameBytes, // 0x0c: 20-byte name
    0x01,
    0x02, // 0x20: unknown
    0x00,
    0x36, // 0x22: packet length
    id, // 0x24: device id
    DEVICE_TYPE_CDJ, // 0x25: device type
    ...macBytes, // 0x26: 6-byte mac
    ...ipBytes, // 0x2c: 4-byte ip
    0x01,
    0x00,
    0x00,
    0x00, // 0x30: unknown
    DEVICE_TYPE_CDJ, // 0x34: device type
    0x00, // 0x35: padding
  ]);
};

const packet = buildAnnouncePacket({
  id: VCDJ_ID,
  ipBytes: ipToBytes(v4.address),
  macBytes: macToBytes(v4.mac),
  name: VIRTUAL_CDJ_NAME,
});

const broadcast = broadcastAddress(v4.cidr);

const sock = dgram.createSocket({type: 'udp4', reuseAddr: true});
sock.on('error', err => {
  console.error('socket error:', err);
  process.exit(1);
});

sock.bind(0, v4.address, () => {
  sock.setBroadcast(true);
  console.log(
    `announcing as CDJ id=${VCDJ_ID} from ${v4.address} -> ${broadcast}:${ANNOUNCE_PORT} every ${ANNOUNCE_INTERVAL_MS}ms`,
  );
});

let count = 0;
const tick = () => {
  sock.send(packet, ANNOUNCE_PORT, broadcast, err => {
    if (err) {
      console.error('send failed:', err.message);
      return;
    }
    count += 1;
    if (count <= 3 || count % 20 === 0) {
      console.log(`[${new Date().toISOString()}] sent ${packet.length}B (#${count})`);
    }
  });
};
const handle = setInterval(tick, ANNOUNCE_INTERVAL_MS);
tick();

const shutdown = sig => {
  console.log(`\n${sig} received; stopping after ${count} announces.`);
  clearInterval(handle);
  sock.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
