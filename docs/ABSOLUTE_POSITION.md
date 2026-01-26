# Absolute Position Packet Support

This document describes the absolute position packet support added to alphatheta-connect, enabling precise playhead tracking from CDJ-3000+ devices.

## Overview

CDJ-3000 and newer Pioneer DJ devices broadcast **absolute position packets** on port 50001 approximately every 30ms while a track is loaded. These packets provide much more accurate position tracking than the traditional method of combining beat packets with downloaded beat grids.

### Key Benefits

- **Precise position tracking**: Playhead position reported in milliseconds
- **Independent of beat grids**: Works even without analyzed tracks
- **Real-time accuracy**: Updates every ~30ms during playback
- **Handles all playback modes**: Scratching, reverse play, loops, needle jumping
- **Useful for sync applications**: Timecode, video sync, lighting cues

## Packet Format

Based on [Deep Symmetry's DJL Analysis](https://djl-analysis.deepsymmetry.org/djl-analysis/beats.html#absolute-position-packets):

```
Offset  Field          Description
------  -------------  ----------------------------------------------------
0x20    Subtype        0x00 (identifies position packet)
0x21    DeviceID       Player number (1-4)
0x22    lenr           Length of remaining packet data
0x24    TrackLength    Track duration in seconds (rounded down)
0x28    Playhead       Absolute position in milliseconds
0x2c    Pitch          Pitch slider value × 6400 (e.g., 3.26% = 20864)
0x30    BPM            Effective BPM × 10 (e.g., 120.2 = 1202)
                       0xffffffff if unknown
```

## API Usage

### Basic Example

```typescript
import {bringOnline} from 'alphatheta-connect';

const network = await bringOnline();
await network.autoconfigFromPeers();
network.connect();

// Listen for position updates (every ~30ms from CDJ-3000+)
network.positionEmitter?.on('position', position => {
  console.log(`Player ${position.deviceId}:`);
  console.log(`  Position: ${position.playhead}ms`);
  console.log(`  Track Length: ${position.trackLength}s`);
  console.log(`  BPM: ${position.bpm}`);
  console.log(`  Pitch: ${position.pitch}%`);
});
```

### Position State Interface

```typescript
interface PositionState {
  /** Device ID sending this position update (1-4) */
  deviceId: number;

  /** Track length in seconds (rounded down) */
  trackLength: number;

  /** Absolute playhead position in milliseconds */
  playhead: number;

  /** Pitch slider value as percentage (e.g., 3.26 for +3.26%) */
  pitch: number;

  /** Effective BPM (track BPM adjusted by pitch), null if unknown */
  bpm: number | null;
}
```

### Complete Example

See [examples/position-tracking.ts](../examples/position-tracking.ts) for a working example that demonstrates:
- Listening for position updates
- Calculating progress percentage
- Formatting timestamps
- Combining with status packets

## Device Compatibility

| Device       | Position Packets | Notes                          |
| ------------ | ---------------- | ------------------------------ |
| CDJ-3000     | ✅ Yes            | Full support, sent every ~30ms |
| CDJ-2000NXS2 | ❌ No             | Uses beat packets only         |
| CDJ-2000NXS  | ❌ No             | Uses beat packets only         |
| XDJ-XZ       | ❌ No             | Limited Pro DJ Link support    |
| Rekordbox    | ❌ No             | Does not send position packets |

## Implementation Details

### Packet Detection

Position packets are distinguished from beat packets by:
1. Subtype byte at 0x20 is 0x00
2. Minimum packet length (lenr ≥ 0x0c)
3. Presence of position-specific fields

### Update Frequency

- Position packets: **~30ms** interval (33 Hz)
- Status packets: **~100-200ms** interval (5-10 Hz)
- Beat packets: Variable (depends on track BPM)

This high update frequency makes position packets ideal for real-time synchronization applications.

### Performance Considerations

Position packets arrive frequently (33 times per second per player). For applications that don't need this granularity, consider:

```typescript
// Throttle updates to every 100ms
let lastUpdate = 0;
network.positionEmitter?.on('position', position => {
  const now = Date.now();
  if (now - lastUpdate < 100) return;
  lastUpdate = now;

  // Process position...
});
```

## Testing

Tests are located in `tests/status/position.spec.ts` and cover:
- Packet format validation
- Position field parsing
- BPM handling (including unknown BPM)
- Negative pitch values
- Edge cases (playhead at start, track boundaries)

Run tests with:
```bash
npm test -- position.spec.ts
```

## Related Documentation

- [Deep Symmetry: Absolute Position Packets](https://djl-analysis.deepsymmetry.org/djl-analysis/beats.html#absolute-position-packets)
- [Deep Symmetry: Beat Packets](https://djl-analysis.deepsymmetry.org/djl-analysis/beats.html#beat-packets)
- [CDJ Status Packets](https://djl-analysis.deepsymmetry.org/djl-analysis/vcdj.html)

## Changelog

### v0.14.0 (Pending)
- ✨ Added `PositionEmitter` for absolute position tracking
- ✨ Added `PositionState` interface
- ✨ Added `positionFromPacket` parser function
- ✨ Added support for CDJ-3000 position packets
- ✨ Added example: `examples/position-tracking.ts`
- ✅ Added comprehensive tests for position packet parsing
