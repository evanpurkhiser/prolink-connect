#!/usr/bin/env node
/* global require, console, process, setInterval */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Passive Monitoring Example
 *
 * Demonstrates monitoring Pro DJ Link devices using packet capture (pcap)
 * instead of binding to UDP ports. This allows running alongside Rekordbox
 * without port conflicts.
 *
 * Features:
 * - Device discovery via sniffed announce packets
 * - Real-time status monitoring (track, BPM, pitch, play state)
 * - Track metadata via NFS (works without announcing on network)
 * - Works with USB-connected devices (XDJ-AZ, XDJ-XZ)
 *
 * Usage:
 *   sudo node examples/passive-monitoring.js [interface]
 *   sudo node examples/passive-monitoring.js en0
 *   sudo node examples/passive-monitoring.js --list
 *
 * Note: Requires sudo for raw packet capture.
 * Note: Run `npm run build` first to compile.
 */

const {
  bringOnlinePassive,
  CDJStatus,
  DeviceType,
  MediaSlot,
  TrackType,
  findAlphaThetaInterface,
  getArpCacheForInterface,
} = require('../lib/index');

// =============================================================================
// Colors
// =============================================================================

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  brightWhite: '\x1b[97m',
};

// =============================================================================
// Logging
// =============================================================================

function log(level, msg) {
  const ts = new Date().toISOString().substring(11, 23);
  const icons = {
    info: `${c.blue}●${c.reset}`,
    success: `${c.green}✓${c.reset}`,
    warn: `${c.yellow}!${c.reset}`,
    error: `${c.red}✗${c.reset}`,
    track: `${c.magenta}♪${c.reset}`,
  };
  console.log(`${c.gray}${ts}${c.reset} ${icons[level]} ${msg}`);
}

// =============================================================================
// State
// =============================================================================

const players = new Map();
const lastTrackId = new Map();

// =============================================================================
// Helpers
// =============================================================================

function slotName(slot) {
  switch (slot) {
    case MediaSlot.USB:
      return 'USB';
    case MediaSlot.SD:
      return 'SD';
    case MediaSlot.CD:
      return 'CD';
    case MediaSlot.RB:
      return 'Rekordbox Link';
    default:
      return `Slot ${slot}`;
  }
}

function showInterfaces() {
  console.log(`\n${c.bold}Available network interfaces:${c.reset}\n`);

  try {
    const Cap = require('cap').Cap;
    const capDevices = Cap.deviceList();

    for (const dev of capDevices) {
      const addrs = dev.addresses
        .filter(a => a.addr && !a.addr.includes(':'))
        .map(a => a.addr)
        .join(', ');

      if (addrs) {
        const isLinkLocal = addrs.includes('169.254.');
        console.log(`  ${c.cyan}${dev.name}${c.reset}`);
        console.log(
          `    ${c.dim}${addrs}${isLinkLocal ? ' (USB device?)' : ''}${c.reset}`
        );
        if (dev.description) {
          console.log(`    ${c.dim}${dev.description}${c.reset}`);
        }
        console.log('');
      }
    }
  } catch {
    console.error(`${c.red}Error:${c.reset} 'cap' module required`);
    console.error(`Install with: npm install cap`);
    process.exit(1);
  }
}

function findDefaultInterface() {
  // Look for an AlphaTheta device (USB or Ethernet)
  const alphaThetaIface = findAlphaThetaInterface();
  if (alphaThetaIface) {
    const connType = alphaThetaIface.connectionType || 'unknown';
    log(
      'info',
      `Found AlphaTheta device on ${c.cyan}${alphaThetaIface.name}${c.reset} (${connType})`
    );
    if (alphaThetaIface.ipv4) {
      log('info', `Host IP: ${alphaThetaIface.ipv4}`);

      // Show device IPs if already detected (Ethernet mode)
      if (alphaThetaIface.deviceIps && alphaThetaIface.deviceIps.length > 0) {
        log('info', `AlphaTheta device IP(s): ${alphaThetaIface.deviceIps.join(', ')}`);
      } else {
        // Try to find device IP from ARP cache (USB mode)
        const arpIps = getArpCacheForInterface(alphaThetaIface.name);
        if (arpIps.length > 0) {
          log('info', `Device IP(s) from ARP: ${arpIps.join(', ')}`);
        }
      }
    }
    return alphaThetaIface.name;
  }

  return null;
}

// =============================================================================
// Display
// =============================================================================

function playStateName(state) {
  // Values from CDJStatus.PlayState enum
  const names = {
    0x00: 'Empty',
    0x02: 'Loading',
    0x03: 'Playing',
    0x04: 'Looping',
    0x05: 'Paused',
    0x06: 'Cued',
    0x07: 'Cuing',
    0x08: 'PlatterHeld',
    0x09: 'Searching',
    0x0e: 'SpunDown',
    0x11: 'Ended',
  };
  return names[state] || `State${state}`;
}

function startDisplay() {
  setInterval(() => {
    if (players.size === 0) {
      return;
    }

    console.log();
    console.log(`${c.bold}═══ Player Status ═══${c.reset}`);

    const sortedPlayers = Array.from(players.values()).sort(
      (a, b) => a.device.id - b.device.id
    );

    for (const player of sortedPlayers) {
      // Line 1: Device info and play state
      const playIcon = player.isPlaying
        ? `${c.green}▶${c.reset}`
        : `${c.gray}⏸${c.reset}`;
      const onAir = player.isOnAir ? `${c.red}ON AIR${c.reset}` : `${c.dim}off${c.reset}`;
      const master = player.isMaster ? `${c.yellow}MASTER${c.reset}` : '';
      const sync = player.isSync ? `${c.blue}SYNC${c.reset}` : '';

      console.log(
        `  ${c.cyan}[${player.device.id}]${c.reset} ${c.bold}${player.device.name}${c.reset} ${playIcon} ${onAir} ${master} ${sync}`.trim()
      );

      // Line 2: BPM and pitch
      const bpm = player.bpm ? player.bpm.toFixed(2) : '---';
      const effectiveBpm = player.effectiveBpm ? player.effectiveBpm.toFixed(2) : '---';
      const pitch =
        player.pitch >= 0
          ? `+${player.pitch.toFixed(2)}%`
          : `${player.pitch.toFixed(2)}%`;
      console.log(
        `       BPM: ${c.brightWhite}${bpm}${c.reset} → ${c.green}${effectiveBpm}${c.reset} (${pitch})`
      );

      // Line 3: Beat info
      const beat = player.beatInMeasure || 1;
      const beatBar = ['○', '○', '○', '○'];
      beatBar[beat - 1] = '●';
      console.log(
        `       Beat: ${beatBar.join(' ')}  |  State: ${playStateName(player.playState)}`
      );

      // Line 4: Track info
      if (player.trackTitle) {
        console.log(
          `       Track: ${c.brightWhite}${player.trackArtist}${c.reset} – ${player.trackTitle}`
        );
      } else if (player.trackId > 0) {
        console.log(
          `       Track: ${c.dim}ID ${player.trackId} from ${slotName(player.trackSlot)}${c.reset}`
        );
      } else {
        console.log(`       Track: ${c.dim}No track loaded${c.reset}`);
      }
      console.log();
    }
  }, 2000);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  console.log(`\n${c.bold}${c.cyan}Passive Pro DJ Link Monitor${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(40)}${c.reset}`);
  console.log(`${c.dim}Monitors DJ Link devices via packet capture${c.reset}`);
  console.log(`${c.dim}Can run alongside Rekordbox${c.reset}\n`);

  if (args.includes('--list') || args.includes('-l')) {
    showInterfaces();
    process.exit(0);
  }

  // Check for root
  if (process.getuid && process.getuid() !== 0) {
    log('error', 'Requires root privileges for packet capture');
    console.log(
      `\n${c.dim}Run with:${c.reset} ${c.yellow}sudo node examples/passive-monitoring.js${c.reset}\n`
    );
    process.exit(1);
  }

  // Get interface
  let iface = args[0];
  if (!iface || iface.startsWith('-')) {
    iface = findDefaultInterface();
    if (!iface) {
      log('error', 'No AlphaTheta device found');
      console.log(
        `${c.dim}Make sure your DJ hardware is connected via USB or Ethernet${c.reset}`
      );
      console.log(
        `${c.dim}Or specify an interface manually:${c.reset} ${c.cyan}sudo node examples/passive-monitoring.js en15${c.reset}\n`
      );
      process.exit(1);
    }
  }

  // Start passive monitoring using the new API
  let network;
  try {
    log('info', `Starting capture on ${c.bold}${iface}${c.reset}...`);
    network = await bringOnlinePassive({iface});
    log('success', 'Capture started, waiting for devices...');
    console.log(`${c.dim}Press Ctrl+C to exit${c.reset}\n`);
  } catch (err) {
    log('error', `Failed to start capture: ${err.message}`);
    process.exit(1);
  }

  // Handle device connections
  network.deviceManager.on('connected', device => {
    const typeStr = device.type === DeviceType.CDJ ? 'CDJ' : 'Mixer';
    log(
      'success',
      `${typeStr} connected: ${c.brightWhite}${device.name}${c.reset} ${c.dim}[id: ${device.id}]${c.reset}`
    );

    if (device.type === DeviceType.CDJ) {
      players.set(device.id, {
        device,
        trackId: 0,
        trackSlot: MediaSlot.Empty,
        trackDeviceId: 0,
        bpm: null,
        effectiveBpm: null,
        pitch: 0,
        isPlaying: false,
        isOnAir: false,
        isMaster: false,
        isSync: false,
        beatInMeasure: 1,
        beat: null,
        playState: 0,
      });
    }
  });

  network.deviceManager.on('disconnected', device => {
    log('warn', `Device disconnected: ${device.name}`);
    players.delete(device.id);
  });

  // Handle status updates
  network.statusEmitter.on('status', async status => {
    const player = players.get(status.deviceId);
    if (!player) {
      return;
    }

    // Update player state
    player.bpm = status.trackBPM;
    player.effectiveBpm = status.trackBPM
      ? status.trackBPM * (1 + status.sliderPitch / 100)
      : null;
    player.pitch = status.sliderPitch;
    player.isPlaying = status.playState === CDJStatus.PlayState.Playing;
    player.isOnAir = status.isOnAir;
    player.isMaster = status.isMaster;
    player.isSync = status.isSync;
    player.beatInMeasure = status.beatInMeasure;
    player.beat = status.beat;
    player.trackSlot = status.trackSlot;
    player.trackDeviceId = status.trackDeviceId;
    player.playState = status.playState;

    // Check for track change
    if (lastTrackId.get(status.deviceId) !== status.trackId) {
      lastTrackId.set(status.deviceId, status.trackId);
      player.trackId = status.trackId;
      player.trackTitle = undefined;
      player.trackArtist = undefined;

      if (status.trackId === 0) {
        log('info', `${c.dim}[${status.deviceId}] No track loaded${c.reset}`);
        return;
      }

      log(
        'info',
        `[${status.deviceId}] Track ${status.trackId} from ${slotName(status.trackSlot)}`
      );

      // Try to fetch metadata
      try {
        let track = null;

        if (status.trackSlot === MediaSlot.RB) {
          // Rekordbox Link - use RemoteDB to query Rekordbox
          log('info', `${c.magenta}Rekordbox Link${c.reset} - querying via RemoteDB...`);
          track = await network.remotedb.getTrackMetadata(
            status.trackDeviceId,
            status.trackSlot,
            TrackType.RB,
            status.trackId
          );
        } else {
          // USB/SD - use NFS to fetch from local database
          const orm = await network.localdb.get(status.trackDeviceId, status.trackSlot);
          if (orm) {
            track = orm.findTrack(status.trackId);
          }
        }

        if (track) {
          const artist = track.artist?.name || 'Unknown';
          player.trackTitle = track.title;
          player.trackArtist = artist;
          log(
            'track',
            `${c.bold}[${status.deviceId}]${c.reset} ${c.brightWhite}${artist}${c.reset} ${c.dim}–${c.reset} ${track.title}`
          );
        }
      } catch (err) {
        log('warn', `Could not fetch metadata: ${err.message}`);
      }
    }
  });

  // Handle on-air status from mixer
  network.statusEmitter.on('onAir', onAirStatus => {
    if (!onAirStatus.channels) {
      return;
    }
    for (const [channelId, isOnAir] of Object.entries(onAirStatus.channels)) {
      const player = players.get(parseInt(channelId, 10));
      if (player) {
        player.isOnAir = isOnAir;
      }
    }
  });

  // Start display loop
  startDisplay();

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log(`\n${c.dim}Shutting down...${c.reset}`);
    network.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error(`${c.red}Error:${c.reset}`, err.message);
  process.exit(1);
});
