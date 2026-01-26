# All-in-One Unit Support

## Overview

This document describes support for all-in-one DJ controllers like the XDJ-XZ, XDJ-RX series, XDJ-AZ, and Opus Quad. These devices have unique behaviors that differ from standalone CDJs and mixers.

## Slot Mapping

All-in-one units have USB slots but use the Pro DJ Link protocol's SD/USB slot identifiers differently than standalone CDJs.

### XDJ-XZ / XDJ-AZ

The XDJ-XZ has two USB slots on the top panel. Because the protocol was designed for devices with separate SD and USB slots, the XDJ-XZ maps its USB ports as follows:

| Physical Label | Protocol Slot | Protocol Value |
|----------------|---------------|----------------|
| USB 1          | SD            | `0x02` (2)     |
| USB 2          | USB           | `0x03` (3)     |

Both decks (player 1 and player 2) share the same IP address and access the same media slots. The slots are represented as belonging to player 1.

**Reference:** [dysentery vcdj.adoc](https://djl-analysis.deepsymmetry.org/djl-analysis/vcdj.html)

> The XDJ-XZ presents an unusual situation because it embodies two separate players and a mixer all sharing the same IP address. Because of limitations in the protocol, that means it can only offer one pair of slots to the network, so its two USB slots are represented as though they belong to player 1. The slot labeled USB 1 is treated on the network as the SD slot, and the slot labeled USB 2 as the USB slot.

## Missing Media Slot Broadcasts

### The Problem

Standalone CDJs periodically broadcast `mediaSlot` info packets (type `0x06`) that describe the media inserted in each slot. These packets include:

- Device ID and slot number
- Media name and color
- Track count and type (rekordbox, unanalyzed, etc.)
- Storage capacity information

The `PassiveLocalDatabase` uses these broadcasts to cache media information, which is then used when fetching the rekordbox database via NFS.

**All-in-one units (XDJ-XZ, XDJ-RX, XDJ-AZ, Opus Quad) do NOT broadcast these `mediaSlot` packets.**

This means passive mode implementations cannot rely on receiving media slot information before attempting to fetch track metadata.

### The Solution

The `PassiveLocalDatabase.get()` method now includes a fallback path via `getWithoutMedia()`:

1. First, check if cached media info exists (from `mediaSlot` broadcasts)
2. If cached info exists, use `getWithMedia()` as normal
3. If no cached info exists, attempt `getWithoutMedia()`:
   - Create synthetic media info assuming rekordbox format
   - Attempt to fetch the `export.pdb` database via NFS
   - If successful, the database is hydrated and cached
   - If the NFS fetch fails (no database found), return null

```typescript
// This now works for all-in-one units
const orm = await network.localdb.get(deviceId, MediaSlot.SD);
if (orm) {
  const track = await orm.findTrack(trackId);
}
```

### Implications

- **No pre-validation**: Without `mediaSlot` broadcasts, we cannot verify the media type before fetching. The code assumes rekordbox format and will fail gracefully if no `export.pdb` exists.

- **No media metadata**: Information like media name, track count, and storage capacity is not available for all-in-one units in passive mode.

- **First fetch is slower**: The database must be fetched on-demand when the first track plays, rather than being preloaded based on media slot broadcasts.

## Device IDs

The XDJ-XZ uses multiple device IDs from a single IP address:

| Device ID | Function |
|-----------|----------|
| 1         | Deck 1 (left) |
| 2         | Deck 2 (right) |
| 33 (0x21) | Mixer section |

## Play State Values

The XDJ-XZ uses different play state values than nexus players:

| State   | XDJ-XZ Value | Nexus Value |
|---------|--------------|-------------|
| Playing | `0x9a`       | `0xfa`      |
| Stopped | `0x9e`       | `0xfe`      |

## Network Limitations

When connected via the laptop/network port (rather than Channel 3/4 ports), the XDJ-XZ has protocol limitations:

- Does not send "assignment finished" packets
- May incorrectly approve conflicting device number claims
- Does not defend its own device numbers (1, 2) with conflict packets

For best results, connect additional devices to Channel 3 or Channel 4 ports when available.

**Reference:** [dysentery startup.adoc - XDJ-XZ Limitations](https://djl-analysis.deepsymmetry.org/djl-analysis/startup.html#xdj-xz-limitations)

## Tested Devices

| Device | USB Slots | Slot Mapping | mediaSlot Broadcasts |
|--------|-----------|--------------|----------------------|
| XDJ-XZ | 2 | USB1→SD, USB2→USB | No |
| XDJ-RX2 | 2 | Expected same as XDJ-XZ | Untested |
| XDJ-RX3 | 2 | Expected same as XDJ-XZ | Untested |
| XDJ-AZ | 2 | Same as XDJ-XZ | Untested |
| Opus Quad | 2 | Unknown | Untested |

## References

- [dysentery - Virtual CDJ Status Packets](https://djl-analysis.deepsymmetry.org/djl-analysis/vcdj.html)
- [dysentery - XDJ-XZ Limitations](https://djl-analysis.deepsymmetry.org/djl-analysis/startup.html#xdj-xz-limitations)
- [dysentery - Mixer Integration](https://djl-analysis.deepsymmetry.org/djl-analysis/mixer_integration.html)
