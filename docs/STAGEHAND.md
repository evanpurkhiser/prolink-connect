# Pioneer Stagehand Connection Mode

This document describes how to use the Stagehand connection mode in `alphatheta-connect` to actively join the Pro DJ Link network as a virtual iPad running Pioneer DJ's Stagehand app. This mode unlocks advanced features including rich telemetry monitoring (mixer faders, EQ values, high-frequency VU levels) and direct remote control over CDJ playback and mixer preferences.

---

## 1. Overview

Pioneer DJ's Stagehand is a mobile application used by front-of-house crew to monitor DJ gear (CDJs and mixers) on the network. 

By posing as a Stagehand iOS device on the network, `alphatheta-connect` can:
1. Receive **high-frequency per-channel mixer state** pushes (faders, EQ knobs, trim, crossfader).
2. Receive **ultra-low-latency real-time VU level samples** directly from the mixer.
3. Perform **CDJ remote control** (play, pause, seek forward/backward, track skip).
4. Perform **CDJ/Mixer preference writes** (on-air display toggles, quantize value changes).

---

## 2. Connecting in Stagehand Mode

To connect to the network in Stagehand mode, configure the `connectMethod` option to `'stagehand'` when initializing or configuring your Prolink network.

```typescript
import {bringOnline} from 'alphatheta-connect';

async function main() {
  // Bring the network online with Stagehand configuration
  const network = await bringOnline({
    connectMethod: 'stagehand',
    vcdjName: 'Stagehand-Control' // Custom virtual iPad name
  });

  // Autoconfigure interface from peers (assigns a randomized ID in the 141-211 range)
  await network.autoconfigFromPeers();

  // Connect to start the Stagehand abbreviated handshake
  network.connect();
  
  console.log('Connected to network posing as Stagehand client!');
}
```

---

## 3. Telemetry Events (Monitoring)

Once connected, Stagehand telemetry is received on ports `50001` (VU levels) and `50002` (mixer fader positions).

### 3.1 Mixer State (Fader & EQ Positions)

The mixer (such as DJM-A9 or DJM-V10) pushes physical knob and fader positions approximately 4 times per second to port `50002`. This is surfaced via the `'mixerState'` event on `StatusEmitter`.

```typescript
network.statusEmitter.on('mixerState', mixerState => {
  console.log(`Mixer State from ${mixerState.deviceName} (ID: ${mixerState.deviceId}):`);
  console.log(`  Crossfader: ${mixerState.crossfader}`);
  
  for (const [ch, state] of Object.entries(mixerState.channels)) {
    console.log(`  Channel ${ch}:`);
    console.log(`    Trim: ${state.trim}`);
    console.log(`    EQ Hi: ${state.eqHi} | Mid: ${state.eqMid} | Low: ${state.eqLow}`);
    console.log(`    Color FX: ${state.colorFx}`);
    console.log(`    Fader: ${state.fader}`);
    console.log(`    Crossfader Assign: ${state.crossfaderAssign}`);
  }
});
```

### 3.2 Real-Time Audio VU Levels

The mixer pushes real-time VU level sample streams on port `50001` approximately 30 times per second for visual meter rendering. This is surfaced via the `'vu'` event on `PositionEmitter`.

```typescript
network.positionEmitter.on('vu', vu => {
  console.log(`VU Levels for Mixer (ID: ${vu.deviceId}):`);
  
  for (const [ch, frames] of Object.entries(vu.channels)) {
    // Each channel contains a sliding-window array of 15 stereo frames (16-bit uint values)
    const latestFrame = frames[frames.length - 1];
    console.log(`  Channel ${ch} - Latest VU -> Left: ${latestFrame.left}, Right: ${latestFrame.right}`);
  }
});
```

---

## 4. Remote Control (Writing States)

When connected in Stagehand mode, the `network.control` service automatically utilizes the Stagehand protocol (`0x07` transport commands and `0x6b` preference writes) to control devices.

### 4.1 Transport Commands

The transport control commands target port `50001` of the destination CDJ device.

#### 4.1.1 Play & Pause

The standard API `control.setPlayState` automatically detects Stagehand mode and delegates to the appropriate transport packets:

```typescript
// Seamlessly delegates to Stagehand play/pause packets
await network.control.setPlayState(cdjDevice, CDJStatus.PlayState.Playing);
await network.control.setPlayState(cdjDevice, CDJStatus.PlayState.Cued);
```

You can also call the specialized methods directly:

```typescript
// Sends Stagehand play sequence (paired 0x0f and 0x14 packets)
await network.control.play(cdjDevice);

// Sends Stagehand pause command (paired 0x14 packet with release flag)
await network.control.pause(cdjDevice);
```

#### 4.1.2 Seek & Search (Jog-wheel seek)

Simulate continuous search forward and search backward holding:

```typescript
// Start seek forward
await network.control.seekForward(cdjDevice, true);

// Stop seek forward (release)
await network.control.seekForward(cdjDevice, false);

// Start seek backward
await network.control.seekBackward(cdjDevice, true);

// Stop seek backward (release)
await network.control.seekBackward(cdjDevice, false);
```

#### 4.1.3 Track Skip

Simulate skip forward / skip backward button presses:

```typescript
// Initiate skip press
await network.control.skip(cdjDevice, true);

// Release skip
await network.control.skip(cdjDevice, false);
```

---

### 4.2 Preference Writes

Configure equipment settings directly from the virtual Stagehand client by transmitting `0x6b` (124-byte) preference write packets to port `50002` on the destination CDJ.

```typescript
// Toggle On-Air display mode to ON
await network.control.setPreference(cdjDevice, { onAir: 'on' });

// Toggle On-Air display mode to OFF
await network.control.setPreference(cdjDevice, { onAir: 'off' });

// Toggle quantize value change (value is set as 0x80 | enum_index)
await network.control.setPreference(cdjDevice, { quantize: 1 }); // Quantize index 1
```

---

## 5. API Compatibility

To preserve backwards-compatibility and maintain documentation integrity:
- Existing active (`vcdjId` < 7) and passive modes remain fully supported and completely untouched.
- `network.control.setPlayState(device, state)` works out-of-the-box regardless of your connection mode, automatically translating state mappings into correct network packets.
