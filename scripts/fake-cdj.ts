#!/usr/bin/env node
/**
 * Long-running "fake CDJ" daemon.
 *
 * Pose as a CDJ on the prolink network so that Rekordbox enables Link Export
 * (and its NFS server) without any real DJ hardware present. Intended to run
 * on a host that shares an L2 broadcast domain with the Rekordbox machine —
 * typically a home server, since binding to ANNOUNCE/STATUS/BEAT ports on the
 * same host as Rekordbox will collide.
 *
 * Env:
 *   IFACE    — name of the network interface to claim (e.g. "eth0", "br-lan").
 *              When set, the daemon configures synchronously without waiting
 *              for a peer. Required on multi-homed hosts so we don't pick the
 *              wrong subnet. Run with no IFACE to see the available list.
 *   VCDJ_ID  — virtual CDJ id (1-6 to satisfy Rekordbox metadata gating).
 *              Default 5.
 */
import signale from 'signale';

import type {NetworkInterfaceInfoIPv4} from 'node:os';
import {networkInterfaces} from 'node:os';

import {bringOnline} from 'src/network';
import type {Device} from 'src/types';
import {DeviceType} from 'src/types';
import {getMatchingInterface} from 'src/utils';

const VCDJ_ID = Number(process.env.VCDJ_ID ?? 5);
const IFACE = process.env.IFACE;

if (!Number.isInteger(VCDJ_ID) || VCDJ_ID < 1 || VCDJ_ID > 6) {
  signale.error('VCDJ_ID must be an integer in [1, 6] (got %s)', process.env.VCDJ_ID);
  process.exit(1);
}

function listIfaces() {
  const rows: string[] = [];
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) {
        continue;
      }
      rows.push(`  ${name.padEnd(16)} ${info.cidr}`);
    }
  }
  return rows.join('\n');
}

function pickIface(name: string) {
  const infos = networkInterfaces()[name];
  if (!infos) {
    signale.fatal('No interface named "%s". Available:\n%s', name, listIfaces());
    process.exit(1);
  }
  const v4 = infos.find(
    (i): i is NetworkInterfaceInfoIPv4 => i.family === 'IPv4' && !i.internal,
  );
  if (!v4) {
    signale.fatal('Interface "%s" has no external IPv4 address', name);
    process.exit(1);
  }
  return v4;
}

async function main() {
  if (!IFACE) {
    signale.note(
      'IFACE not set; will autoconfigure from first peer. Available IPv4 interfaces:\n%s',
      listIfaces(),
    );
  }

  signale.await('Bringing up prolink network');
  const network = await bringOnline();
  signale.success('Network online');

  network.deviceManager.on('connected', d =>
    signale.star(
      'Device connected: %s [id=%s type=%s ip=%s]',
      d.name,
      d.id,
      DeviceType[d.type] ?? d.type,
      d.ip.address,
    ),
  );
  network.deviceManager.on('disconnected', d =>
    signale.warn('Device disconnected: %s [id=%s]', d.name, d.id),
  );

  const iface = IFACE
    ? pickIface(IFACE)
    : await (async () => {
        signale.await('Waiting for a peer to derive the interface');
        const firstPeer = await new Promise<Device>(resolve =>
          network.deviceManager.once('connected', resolve),
        );
        const matched = getMatchingInterface(firstPeer.ip);
        if (matched === null) {
          signale.fatal('No local interface matches peer subnet (%s)', firstPeer.ip.address);
          process.exit(1);
        }
        return matched;
      })();

  network.configure({iface, vcdjId: VCDJ_ID});
  signale.success('Configured iface=%s vcdjId=%s', iface.cidr ?? iface.address, VCDJ_ID);

  network.connect();
  if (!network.isConnected()) {
    signale.fatal('Failed to connect');
    process.exit(1);
  }

  signale.star('Announcing as CDJ id=%s. Press Ctrl+C to stop.', VCDJ_ID);

  const shutdown = async (sig: string) => {
    signale.await('%s received; disconnecting', sig);
    try {
      await network.disconnect();
    } catch (err) {
      signale.error(err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(err => {
  signale.fatal(err);
  process.exit(1);
});
