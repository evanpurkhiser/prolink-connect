# Full DJ Link Startup Protocol

## Overview

The alphatheta-connect library now supports an optional **full DJ Link startup protocol** implementation. By default, it uses a simple keep-alive approach (backward compatible), but you can enable the complete 4-stage device claiming protocol for advanced scenarios.

## Why Full Startup?

The full startup protocol is required when:

1. **Multiple Virtual CDJs**: Running multiple virtual CDJs on the same network without conflicts
2. **Unstable Networks**: Networks with frequent disconnects where proper device negotiation is critical
3. **Spec Compliance**: Need for full compliance with Pioneer DJ Link specification
4. **Dynamic Device Addition**: Scenarios where virtual CDJs are added/removed dynamically

The simple keep-alive approach (default) works fine for:
- Single virtual CDJ per network
- Stable networks
- Passive listening/monitoring (no active mixing control)

## Configuration

Enable full startup mode by setting the `fullStartup` flag in your `NetworkConfig`:

```typescript
import {bringOnline} from 'alphatheta-connect';

// Bring the network online (creates sockets)
const network = await bringOnline();

// Configure with full startup protocol enabled
network.configure({
  iface: myNetworkInterface,
  vcdjId: 5,  // Can be 1-6, with 5-6 being CDJ-3000 compatible
  fullStartup: true,  // Enable full startup protocol
});

// Connect and begin announcing
network.connect();
```

## Examples

See [full-startup.ts](../examples/full-startup.ts) for comprehensive examples including:

- **Simple Mode (Default)**: Basic keep-alive without full startup
- **Standard CDJ (Player 1-4)**: Full startup for players 1-4
- **CDJ-3000 (Player 5-6)**: Full startup for CDJ-3000 compatible mode
- **Multiple Virtual CDJs**: Running multiple vCDJs with proper negotiation
- **Conditional Startup**: Adapting startup mode based on network conditions
- **Monitoring Progress**: Tracking startup stages with event listeners
- **Comparing Modes**: Decision matrix for choosing startup mode

### Quick Example

```typescript
// Full startup with CDJ-3000 compatibility
const manager = new ProlinkConnectManager();

manager.manuallyConfigureNetwork({
  iface: networkInterface,
  vcdjId: 5,  // CDJ-3000 (players 5-6)
  fullStartup: true,
});

manager.connect();
```

## Startup Protocol Sequence

When `fullStartup` is enabled, the Announcer service follows this 5-stage sequence:

### Stage 0: Initial Announcement (3 packets at ~300ms intervals)
- Packet type: `0x0a`
- Announces device presence to the network
- CDJ-3000 compatible (for players 5-6)

### Stage 1: First-Stage Device Claims (3 packets at ~300ms intervals)
- Packet type: `0x00`
- Includes device ID and MAC address
- Auto-assign flag for dynamic assignment

### Stage 2: Second-Stage Device Claims (3 packets at ~300ms intervals)
- Packet type: `0x02`
- Includes device ID, IP address, and MAC address
- CDJ-3000 specific byte markers

### Stage 3: Final-Stage Device Claims (3 packets at ~300ms intervals)
- Packet type: `0x04`
- Device confirmation and final assignment

### Stage 4: Keep-Alive (every 1500ms)
- Packet type: `0x06`
- Continuous presence announcement
- Transitions to keep-alive mode after stage 3

**Total startup time**: ~1.8 seconds (4 stages × 3 packets × 300ms + overhead)

## CDJ-3000 Compatibility

Player IDs 5 and 6 are reserved for CDJ-3000 compatible devices and use special packet format:
- Byte 0x21 = 0x03 (vs 0x02 for standard CDJs)
- Additional CDJ-3000 specific markers in initial announcement
- Fully compatible with Pioneer CDJ-3000 multitrack mixing

```typescript
// Standard CDJ (player 1-4)
manager.manuallyConfigureNetwork({
  iface: eth0,
  vcdjId: 1,
  fullStartup: true,
});

// CDJ-3000 (player 5-6)
manager.manuallyConfigureNetwork({
  iface: eth0,
  vcdjId: 5,  // CDJ-3000 compatible
  fullStartup: true,
});
```

## Backward Compatibility

The `fullStartup` flag defaults to `false`, ensuring existing code continues to work:

```typescript
// Simple keep-alive mode (default - backward compatible)
manager.manuallyConfigureNetwork({
  iface: myNetworkInterface,
  vcdjId: 1,
  // fullStartup not specified, defaults to false
});

// Equivalent to:
manager.manuallyConfigureNetwork({
  iface: myNetworkInterface,
  vcdjId: 1,
  fullStartup: false,
});
```

## Implementation Details

The startup protocol is implemented in the `Announcer` class (`src/virtualcdj/index.ts`):

- **Mode Detection**: Checks `fullStartup` flag on initialization
- **State Machine**: Tracks current startup stage (0-3) and counter (1-3)
- **Adaptive Intervals**: 300ms during startup, 1500ms for keep-alive
- **Automatic Transition**: Automatically switches from startup to keep-alive after stage 3

## Packet Builders

The following packet builder functions are exported for advanced use:

```typescript
// Initial announcement (type 0x0a)
export function makeInitialAnnouncementPacket(device: Device): Uint8Array

// First-stage claim (type 0x00)
export function makeFirstStageClaimPacket(device: Device, counter: number): Uint8Array

// Second-stage claim (type 0x02)
export function makeSecondStageClaimPacket(device: Device, counter: number): Uint8Array

// Final-stage claim (type 0x04)
export function makeFinalStageClaimPacket(device: Device, counter: number): Uint8Array

// Keep-alive (type 0x06)
export function makeAnnouncePacket(device: Device): Uint8Array
```

## Testing

Run the startup protocol tests:

```bash
npm test -- tests/virtualcdj/startup.test.ts
```

Tests cover:
- Simple vs full startup mode configuration
- Virtual CDJ device creation (standard and CDJ-3000)
- Announcer lifecycle (start/stop)
- Configuration integration with NetworkConfig

## Network Packet Structure

All startup packets use the standard DJ Link network structure:

```
| Offset | Bytes | Field                                         |
| ------ | ----- | --------------------------------------------- |
| 0x00   | 10    | PROLINK_HEADER ("Qspt1WmJOL")                 |
| 0x0A   | 2     | Packet Type (0x0a, 0x00, 0x02, 0x04, or 0x06) |
| 0x0C   | 20    | Device Name (null-padded)                     |
| 0x20   | 2     | Unknown padding (0x01, 0x02)                  |
| 0x22   | 2     | Packet length                                 |
| 0x24+  | Var   | Type-specific data                            |
```

## Performance Considerations

- **Startup overhead**: 1.8 seconds of additional network traffic during connection
- **Network bandwidth**: ~600 bytes total for full startup sequence (3 devices)
- **CPU impact**: Minimal - negligible impact on system resources
- **Recommended**: Only enable for scenarios where multi-device negotiation is necessary

## Troubleshooting

### Devices not appearing after startup
- Verify `fullStartup: true` is set in NetworkConfig
- Check that device IDs (1-6) are unique on the network
- Ensure network interface is correctly configured
- Monitor network traffic to verify packets are being sent

### CDJ-3000 devices not recognized
- Use player IDs 5-6 for CDJ-3000 compatibility
- Verify other CDJ-3000 or real CDJ players are on network
- Check that `fullStartup` is enabled

### Multiple virtual CDJs conflicting
- Use unique device IDs (1-6) for each virtual CDJ
- Enable `fullStartup: true` for proper device negotiation
- Consider using separate network interfaces for each vCDJ

## See Also

- [DJ Link Startup Specification](../docs/startup.html)
- [NetworkConfig Interface](../src/network.ts#L25-L65)
- [Announcer Service](../src/virtualcdj/index.ts)
