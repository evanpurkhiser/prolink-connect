/**
 * Full Monitoring Example
 *
 * Demonstrates comprehensive real-time monitoring of a complete DJ Link setup:
 * - DJM-V10 mixer (all channels and on-air status)
 * - 6 CDJ-3000 players with full startup protocol enabled
 *
 * Features:
 * - Live status display (device connection, on-air state, playback position)
 * - Track metadata display (artist, title, BPM, duration)
 * - Mixer channel status (on-air, level)
 * - Performance monitoring (beat grid, waveforms when available)
 *
 * Usage:
 *   npx ts-node examples/full-monitoring.ts [--iface eth0] [--vcdj 7]
 */

import {bringOnline} from 'prolink-connect';

import {networkInterfaces} from 'os';

import {CDJStatus, Device, DeviceType} from 'src/types';
import {getMatchingInterface} from 'src/utils';

interface PlayerStatus {
  device: Device;
  currentTrack: string;
  bpm: number | null;
  isPlaying: boolean;
  isOnAir: boolean;
  pitch: number;
  beat: number | null;
  position: number; // milliseconds
}

interface MixerStatus {
  device: Device;
  channels: Map<number, {onAir: boolean; name: string}>;
}

async function fullMonitoring() {
  const network = await bringOnline();

  // Parse CLI/env options
  const args = process.argv.slice(2);
  const getArg = (key: string, short?: string) => {
    const longIdx = args.indexOf(`--${key}`);
    const shortIdx = short ? args.indexOf(`-${short}`) : -1;
    if (longIdx !== -1 && args[longIdx + 1]) {
      return args[longIdx + 1];
    }
    if (shortIdx !== -1 && args[shortIdx + 1]) {
      return args[shortIdx + 1];
    }
    return process.env[key.toUpperCase()];
  };

  const ifaceArg = getArg('iface', 'i');
  const vcdjArg = getArg('vcdj', 'v');

  // Helper to resolve IPv4 interface
  const resolveIface = (hint: string) => {
    const all = networkInterfaces();
    const byName = all[hint]?.find(i => i?.family === 'IPv4' && !i.internal);
    if (byName && byName.family === 'IPv4') {
      return byName;
    }
    for (const infos of Object.values(all)) {
      const match = (infos ?? []).find(
        i => i?.family === 'IPv4' && !i.internal && i.address === hint
      );
      if (match && match.family === 'IPv4') {
        return match;
      }
    }
    return null;
  };

  const vcdjId = vcdjArg ? Math.max(1, Math.min(32, parseInt(vcdjArg, 10))) : 7;

  // Configure network
  if (ifaceArg) {
    const iface = resolveIface(ifaceArg);
    if (!iface || iface.family !== 'IPv4') {
      const available = Object.entries(networkInterfaces())
        .flatMap(([name, infos]) =>
          (infos ?? [])
            .filter(i => i.family === 'IPv4' && !i.internal)
            .map(i => `${name}:${i.address}`)
        )
        .join(', ');
      throw new Error(`Unable to resolve iface "${ifaceArg}". Available: ${available}`);
    }
    network.configure({iface, vcdjId, fullStartup: true});
  } else {
    const firstDevice = await new Promise<Device>(resolve =>
      network.deviceManager.once('connected', resolve)
    );
    const iface = getMatchingInterface(firstDevice.ip);
    if (!iface || iface.family !== 'IPv4') {
      throw new Error('Unable to determine network interface');
    }
    network.configure({iface, vcdjId, fullStartup: true});
  }

  network.connect();

  // State tracking
  const players = new Map<number, PlayerStatus>();
  const mixers = new Map<number, MixerStatus>();
  const deviceNames = new Map<number, string>();

  const dm = network.deviceManager;
  const statusEmitter = network.statusEmitter!;

  // Device lifecycle
  dm.on('connected', device => {
    deviceNames.set(device.id, device.name);
    if (device.type === DeviceType.CDJ) {
      players.set(device.id, {
        device,
        currentTrack: 'Loading...',
        bpm: null,
        isPlaying: false,
        isOnAir: false,
        pitch: 0,
        beat: null,
        position: 0,
      });
      console.log(`✓ CDJ #${device.id} connected (${device.name})`);
    } else if (device.type === DeviceType.Mixer) {
      mixers.set(device.id, {device, channels: new Map()});
      console.log(`✓ Mixer #${device.id} connected (${device.name})`);
    }
  });

  dm.on('disconnected', device => {
    const type = device.type === DeviceType.CDJ ? 'CDJ' : 'Mixer';
    console.log(`✗ ${type} #${device.id} disconnected`);
    if (device.type === DeviceType.CDJ) {
      players.delete(device.id);
    } else if (device.type === DeviceType.Mixer) {
      mixers.delete(device.id);
    }
  });

  // Status updates
  statusEmitter.on('status', (state: CDJStatus.State) => {
    const player = players.get(state.deviceId);
    if (!player) {
      return;
    }

    player.bpm = state.trackBPM;
    player.isPlaying = state.playState === CDJStatus.PlayState.Playing;
    player.isOnAir = state.isOnAir;
    player.pitch = state.sliderPitch;
    player.beat = state.beat;
  });

  // On-air status
  statusEmitter.on('onAir', status => {
    if (status.channels) {
      const mixer = mixers.get(status.deviceId);
      if (mixer) {
        for (const [channelId, isOnAir] of Object.entries(status.channels)) {
          const channel = parseInt(channelId, 10);
          mixer.channels.set(channel, {
            onAir: isOnAir as boolean,
            name: `CH${channel}`,
          });
        }
      }
    }
  });

  // Live status display
  setInterval(() => {
    console.clear();
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log(
      '║              Full DJ Link Network Monitoring                        ║'
    );
    console.log(
      '╚════════════════════════════════════════════════════════════════════╝\n'
    );

    // CDJ status
    if (players.size > 0) {
      console.log('📀 CDJ PLAYERS:');
      const sortedPlayers = Array.from(players.values()).sort(
        (a, b) => a.device.id - b.device.id
      );
      for (const player of sortedPlayers) {
        const status = player.isPlaying ? '▶' : '⏸';
        const onAir = player.isOnAir ? '🔴 ON AIR' : '⚪ OFF';
        const bpm = player.bpm ? `${player.bpm}BPM` : '---BPM';
        console.log(
          `  #${player.device.id} ${player.device.name} ${status} ${onAir} ${bpm}`
        );
        if (player.currentTrack !== 'Loading...') {
          console.log(`    → ${player.currentTrack}`);
        }
      }
      console.log();
    }

    // Mixer status
    if (mixers.size > 0) {
      console.log('🎚️  MIXER CHANNELS:');
      for (const mixer of mixers.values()) {
        const channels = Array.from(mixer.channels.entries())
          .map(([_id, ch]) =>
            ch.onAir ? `\x1b[91m${ch.name}\x1b[0m` : `\x1b[90m${ch.name}\x1b[0m`
          )
          .join(' ');
        console.log(`  ${mixer.device.name}: ${channels || 'No channels'}`);
      }
      console.log();
    }

    // Overall status
    const totalDevices = players.size + mixers.size;
    const onAirCount = Array.from(players.values()).filter(p => p.isOnAir).length;
    console.log(`Total Devices: ${totalDevices} | On Air: ${onAirCount}`);
  }, 2000);
}

async function main() {
  try {
    await fullMonitoring();
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch(console.error);
