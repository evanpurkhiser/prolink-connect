# 6-Channel On-Air Support

## Overview

This document describes support for 6-channel on-air status from DJM mixers, specifically the DJM-V10 when paired with CDJ-3000+ devices.

## Background

The on-air feature allows mixers to communicate which channels are currently audible in the mix. This is used by CDJs to display visual feedback (like the red ring around the platter on Nexus models) indicating whether the deck's output is being heard by the audience.

### Variants

#### 4-Channel (DJM-900, DJM-1000)
- **Subtype**: 0x00
- **Length**: 0x0009 (9 data bytes)
- **Channels**: F1, F2, F3, F4 (for CDJs 1-4)
- Packet structure:
  ```
  Bytes 0x24-0x27: F1 F2 F3 F4 (channel flags)
  Bytes 0x28-0x2d: Padding (00)
  ```

#### 6-Channel (DJM-V10 + CDJ-3000)
- **Subtype**: 0x03 (different from 4-channel!)
- **Length**: 0x0011 (17 data bytes)
- **Channels**: F1-F6 (for CDJs 1-6)
- Packet structure:
  ```
  Bytes 0x24-0x27: F1 F2 F3 F4 (channels 1-4)
  Bytes 0x28-0x2d: Padding (00)
  Bytes 0x2e-0x2f: F5 F6 (channels 5-6)
  Bytes 0x30-0x35: Padding (30 00 00 00 00 00)
  ```

## Implementation

### Types

The `OnAirStatus` interface represents the parsed on-air data:

```typescript
export interface OnAirStatus {
  /**
   * The mixer device ID (typically 33 / 0x21).
   */
  deviceId: number;
  /**
   * On-air flags for channels 1-4 (always present).
   * 0x00 = channel is off-air (silenced)
   * 0x01 = channel is on-air (audible)
   */
  channels: {
    1: boolean;
    2: boolean;
    3: boolean;
    4: boolean;
    5?: boolean;
    6?: boolean;
  };
  /**
   * Whether this is a 6-channel variant (CDJ-3000 + DJM-V10).
   */
  isSixChannel: boolean;
}
```

### Parsing

Use the `onAirFromPacket()` function to parse on-air packets from the status socket:

```typescript
import {onAirFromPacket} from 'alphatheta-connect/status/utils';

// Inside your message handler
const onAir = onAirFromPacket(buffer);
if (onAir) {
  console.log(`Channel 1 is ${onAir.channels[1] ? 'on' : 'off'} air`);

  if (onAir.isSixChannel) {
    console.log(`Channel 5 is ${onAir.channels[5] ? 'on' : 'off'} air`);
  }
}
```

### Events

The `StatusEmitter` now emits `onAir` events:

```typescript
import {bringOnline} from 'alphatheta-connect';

const network = await bringOnline();

network.statusEmitter.on('onAir', (status) => {
  // Handle on-air status from mixer
  console.log(`Mixer ID: ${status.deviceId}`);
  console.log(`Channels on air: ${Object.entries(status.channels)
    .filter(([_, isOnAir]) => isOnAir)
    .map(([ch]) => ch)
    .join(', ')}`);

  if (status.isSixChannel) {
    console.log('6-channel mixer detected (DJM-V10)');
  }
});
```

## Usage Example

Combine on-air status with CDJ status to determine if a track is audible:

```typescript
const playerOnAirStatus: Record<number, boolean> = {};

network.statusEmitter.on('onAir', (status) => {
  if (!status.isSixChannel) {
    // 4-channel mixer
    playerOnAirStatus[1] = status.channels[1];
    playerOnAirStatus[2] = status.channels[2];
    playerOnAirStatus[3] = status.channels[3];
    playerOnAirStatus[4] = status.channels[4];
  } else {
    // 6-channel mixer (CDJ-3000+)
    playerOnAirStatus[1] = status.channels[1];
    playerOnAirStatus[2] = status.channels[2];
    playerOnAirStatus[3] = status.channels[3];
    playerOnAirStatus[4] = status.channels[4];
    playerOnAirStatus[5] = status.channels[5];
    playerOnAirStatus[6] = status.channels[6];
  }
});

network.statusEmitter.on('status', (status) => {
  const isAudible = playerOnAirStatus[status.deviceId];

  if (status.playState === CDJStatus.PlayState.Playing && isAudible) {
    console.log(`Player ${status.deviceId} is playing and on-air`);
  }
});
```

## Backward Compatibility

- The implementation is fully backward compatible with 4-channel mixers
- The `isSixChannel` flag allows conditional logic based on mixer type
- Optional channels 5 and 6 are only present when `isSixChannel` is true
- Existing code that doesn't use on-air features continues to work unchanged

## References

- [DJ Link Mixer Integration](https://djl-analysis.deepsymmetry.org/djl-analysis/mixer_integration.html)
- [CDJ-3000 Support](https://djl-analysis.deepsymmetry.org/djl-analysis/devices.html#cdj-3000)
- [DJM-V10 Specifications](https://djl-analysis.deepsymmetry.org/djl-analysis/devices.html#djm-v10)
