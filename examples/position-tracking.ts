/**
 * Example: Absolute Position Tracking
 *
 * This example demonstrates how to use the PositionEmitter to track precise
 * playhead position from CDJ-3000+ devices.
 *
 * Position packets are sent every ~30ms and provide:
 * - Absolute playhead position in milliseconds
 * - Track length in seconds
 * - Current pitch adjustment
 * - Effective BPM
 *
 * This is more accurate than using beat packets + beat grids, especially
 * for scratching, reverse play, loops, and needle jumping.
 */

import {bringOnline} from '../src';

async function main() {
  console.log('Bringing ProLink network online...');
  const network = await bringOnline();

  console.log('Configuring network from peers...');
  await network.autoconfigFromPeers();

  console.log('Connecting to network...');
  network.connect();

  console.log('Listening for absolute position updates from CDJ-3000+ devices...\n');

  // Listen for position updates (sent every ~30ms when track is loaded)
  network.positionEmitter?.on('position', position => {
    const progressPercent = (
      (position.playhead / 1000 / position.trackLength) *
      100
    ).toFixed(1);
    const timeStr = formatTime(position.playhead / 1000);
    const lengthStr = formatTime(position.trackLength);

    console.log(`Player ${position.deviceId}:`);
    console.log(`  Position: ${timeStr} / ${lengthStr} (${progressPercent}%)`);
    console.log(`  Playhead: ${position.playhead}ms`);
    console.log(`  BPM: ${position.bpm?.toFixed(2) ?? 'Unknown'}`);
    console.log(`  Pitch: ${position.pitch.toFixed(2)}%`);
    console.log('');
  });

  // Also listen for regular status updates for comparison
  network.statusEmitter?.on('status', status => {
    if (status.trackId === 0) {
      return; // No track loaded
    }

    console.log(`[Status] Player ${status.deviceId}:`);
    console.log(`  Track ID: ${status.trackId}`);
    console.log(`  Play State: ${status.playState}`);
    console.log(`  Beat: ${status.beat} (${status.beatInMeasure}/4)`);
    console.log(`  BPM: ${status.trackBPM?.toFixed(2) ?? 'Unknown'}`);
    console.log('');
  });

  // Keep running
  console.log('Press Ctrl+C to exit\n');
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
