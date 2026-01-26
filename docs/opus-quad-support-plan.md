# Opus Quad Support for alphatheta-connect

## Overview

Add support for Pioneer DJ Opus Quad all-in-one DJ system, which uses:
- **Deck IDs 9-12** (mapping to physical decks 1-4)
- **Packet type 0x56** for pushed binary data (artwork, phrase data) with multi-packet sequencing
- **OneLibrary database** (already supported via SQLCipher)

## Reference

Based on analysis from: https://github.com/kyleawayan/opus-quad-pro-dj-link-analysis

---

## Phase 1: Device Detection & Deck ID Mapping

**Goal:** Recognize Opus Quad devices and map deck IDs correctly.

### Files to modify:

**`src/constants.ts`** - Add Opus Quad constants:
```typescript
export const OPUS_QUAD_DECK_ID_BASE = 9;
export const BINARY_DATA_PACKET_TYPE = 0x56;
```

**`src/passive/devices.ts`** - Update device type detection (line ~50):
```typescript
// Change: if (deviceId >= 1 && deviceId <= 6)
// To:
if ((deviceId >= 1 && deviceId <= 6) || (deviceId >= 9 && deviceId <= 12)) {
  deviceType = DeviceType.CDJ;
}
```

**`src/utils/index.ts`** - Add deck mapping utilities:
```typescript
export function isOpusQuadDeck(deviceId: number): boolean {
  return deviceId >= 9 && deviceId <= 12;
}

export function opusQuadDeckToLogical(deviceId: number): number {
  return isOpusQuadDeck(deviceId) ? deviceId - 8 : deviceId;
}
```

---

## Phase 2: Binary Data Packet Handling (0x56)

**Goal:** Parse and reassemble multi-packet binary data from Opus Quad.

### New file: `src/passive/binary-data.ts`

**Packet structure (from GitHub analysis):**
| Offset | Content |
|--------|---------|
| 0x0a | Packet type (0x56) |
| 0x21 | Deck ID |
| 0x25 | Data type (0x02=image, 0x04/0x06=unknown) |
| 0x28 | Track ID (big-endian, 4 bytes) |
| 0x31 | Sequence number |
| 0x33 | Total packets |
| 0x34+ | Payload data |

**Components to implement:**
1. `BinaryDataType` enum
2. `parseBinaryPacketHeader()` function
3. `BinaryDataAssembler` class - reassembles multi-packet data with timeout

### Modify: `src/passive/pcap-adapter.ts`

Add `binaryData` event and route 0x56 packets separately from status packets.

---

## Phase 3: Binary Data Integration

**Goal:** Expose pushed artwork/phrase data through the API.

### New file: `src/passive/binary-emitter.ts`

`PassiveBinaryDataEmitter` class that:
- Listens to `binaryData` events from PcapAdapter
- Uses BinaryDataAssembler for packet reassembly
- Emits `artwork` and `phraseData` events with complete data

### New file: `src/passive/artwork-cache.ts`

LRU cache for pushed artwork, queryable by deck/track ID.

### Modify: `src/passive/index.ts`

Add `binaryData` getter to `PassiveProlinkNetwork`.

---

## Phase 4: Status Packet Compatibility

**Goal:** Ensure Opus Quad status packets work correctly.

### Modify: `src/passive/status.ts`

Skip 0x56 packets in status handler (already routed to binary handler):
```typescript
if (message[0x0a] === 0x56) return;
```

**No changes needed to:**
- `src/status/utils.ts` - statusFromPacket() already handles any device ID
- `src/mixstatus/index.ts` - Uses device ID as key, works with 9-12

---

## Phase 5: Testing & Documentation

### Tests to add:
- `tests/passive/binary-data.spec.ts` - Packet parsing and assembly
- `tests/utils/opus-quad.spec.ts` - Deck ID utilities

### Documentation:
- Update README with Opus Quad support notes
- Document known limitation: position packets OR metadata, not both

---

## Implementation Order

```
Phase 1 (Device Detection) - Foundation, start here
    ↓
Phase 2 (Binary Packets) - Can proceed independently
    ↓
Phase 3 (Integration) - Depends on Phase 2
    ↓
Phase 4 (Status Compat) - Quick verification
    ↓
Phase 5 (Tests/Docs)
```

---

## Verification

1. **Unit tests:** Run `npm test` after each phase
2. **Manual testing:** Requires Opus Quad device or packet captures
3. **Integration:** Test with Now Playing desktop app

---

## Notes

- **Database access:** Opus Quad uses OneLibrary format (already supported)
- **Protocol limitation:** High-precision position OR metadata push, not both simultaneously
- **Packet offsets:** Based on GitHub analysis - may need adjustment with real device testing
