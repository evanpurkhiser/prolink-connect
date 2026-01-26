# Passive Mode

Passive mode provides a way to monitor Pro DJ Link networks using packet capture (pcap) instead of actively joining the network as a virtual CDJ.

## Why Passive Mode?

Active mode (the default `bringOnline()`) works by:
- Binding to UDP ports 50000-50002
- Announcing a virtual CDJ on the network
- Participating in the Pro DJ Link protocol

This conflicts with Rekordbox, which also binds to those ports. You can't run both simultaneously.

**Passive mode** solves this by:
- Using pcap to capture packets without binding ports
- Never announcing a virtual CDJ (devices don't know we exist)
- Allowing coexistence with Rekordbox

## Requirements

- **Root/sudo privileges** - Packet capture requires elevated permissions
- **libpcap** (Linux) or **Npcap** (Windows)
- The `cap` npm module (included as a dependency)

## Interface Detection

Before starting passive mode, you need to identify which network interface has Pro DJ Link devices. The library provides several functions for this.

### `findAlphaThetaInterface()`

Auto-detect a single interface with AlphaTheta/Pioneer DJ devices. Returns the first match found.

```typescript
import { findAlphaThetaInterface, bringOnlinePassive } from 'alphatheta-connect';

const iface = findAlphaThetaInterface();
if (iface) {
  console.log(`Found: ${iface.name} (${iface.connectionType})`);
  // Found: en15 (usb)

  const network = bringOnlinePassive({ iface: iface.name });
}
```

### `findAllAlphaThetaInterfaces()`

List **all** interfaces with detected AlphaTheta/Pioneer DJ devices. Useful when multiple devices are connected via different methods (USB and Ethernet) or when you want to present users with a choice.

```typescript
import { findAllAlphaThetaInterfaces, bringOnlinePassive } from 'alphatheta-connect';

const interfaces = findAllAlphaThetaInterfaces();

console.log('Available Pro DJ Link interfaces:');
for (const iface of interfaces) {
  console.log(`  ${iface.name} (${iface.connectionType}) - ${iface.ipv4 || 'no IP'}`);
  if (iface.deviceIps) {
    console.log(`    Devices: ${iface.deviceIps.join(', ')}`);
  }
}

// Example output:
// Available Pro DJ Link interfaces:
//   en15 (usb) - 169.254.82.203
//   en0 (ethernet) - 192.168.1.100
//     Devices: 192.168.1.119, 192.168.1.120

// Let user choose or use first one
if (interfaces.length > 0) {
  const network = bringOnlinePassive({ iface: interfaces[0].name });
}
```

### `listInterfaces()`

List **all** network interfaces on the system (not just ones with detected Pro DJ Link devices). Useful as a fallback when auto-detection doesn't find devices (e.g., device not yet in ARP cache).

```typescript
import { listInterfaces } from 'alphatheta-connect';

const allInterfaces = listInterfaces();

console.log('All network interfaces:');
for (const iface of allInterfaces) {
  console.log(`  ${iface.name} - ${iface.address}`);
}

// Example output:
// All network interfaces:
//   en0 - 192.168.1.100
//   en1 - 10.0.0.50
//   en15 - 169.254.82.203
```

## Detection Methods

The interface detection works differently depending on how your DJ equipment is connected:

### USB Connection

Devices like XDJ-XZ and XDJ-AZ have a USB port that creates a network adapter on your computer. Detection works by:

1. **macOS**: Checks `ioreg` for AlphaTheta USB devices, then `networksetup` to find the corresponding "USB 10/100 LAN" adapter
2. **Windows**: Uses PowerShell `Get-NetAdapter` to find adapters with AlphaTheta/Pioneer in the description

USB interfaces typically have link-local IPs (169.254.x.x).

### Ethernet Connection

Devices connected to your network via Ethernet (directly to a switch/router) are detected by:

1. Scanning the ARP cache (`arp -an` on macOS/Linux, `arp -a` on Windows)
2. Looking for MAC addresses with known AlphaTheta/Pioneer prefixes:
   - `c8:3d:fc` - AlphaTheta (XDJ-XZ, etc.)
   - `74:5e:1c` - Pioneer DJ
   - `ac:b5:7d` - Pioneer DJ
   - `b8:e8:56` - Pioneer DJ
   - `00:e0:4c` - Realtek (used in some Pioneer devices)

**Note**: Ethernet detection requires the device to be in your ARP cache, which happens after network communication. If you just plugged in a device, it may take a moment to appear.

## AlphaThetaInterface Object

Both `findAlphaThetaInterface()` and `findAllAlphaThetaInterfaces()` return objects with:

```typescript
interface AlphaThetaInterface {
  name: string;              // e.g., "en15" (macOS), "Ethernet 3" (Windows)
  mac: string;               // MAC address of the interface
  ipv4?: string;             // IPv4 address (can be link-local 169.254.x.x)
  info: NetworkInterfaceInfo; // Full Node.js interface info
  connectionType: 'usb' | 'ethernet';
  deviceIps?: string[];      // IPs of detected devices (Ethernet only)
}
```

## Basic Usage

```typescript
import {
  findAlphaThetaInterface,
  findAllAlphaThetaInterfaces,
  bringOnlinePassive,
} from 'alphatheta-connect';

// Option 1: Auto-detect (uses first found)
const iface = findAlphaThetaInterface();
if (!iface) {
  console.error('No Pro DJ Link interface found');
  process.exit(1);
}

// Option 2: Let user choose from all detected
const allInterfaces = findAllAlphaThetaInterfaces();
const selectedIface = allInterfaces[0]; // or present UI for selection

// Start passive monitoring
const network = bringOnlinePassive({ iface: iface.name });

// Listen for devices
network.deviceManager.on('connected', device => {
  console.log('Device connected:', device.name);
});

network.deviceManager.on('disconnected', device => {
  console.log('Device disconnected:', device.name);
});

// Listen for track changes
network.statusEmitter.on('status', status => {
  console.log('Track ID:', status.trackId);
});

// Get track metadata via NFS (works without VCDJ announcement)
const track = await network.localdb.getMetadata(deviceId, slot, trackId);

// Cleanup
network.stop();
```

## Comparison: Active vs Passive Mode

| Feature | Active Mode | Passive Mode |
|---------|-------------|--------------|
| Port binding | Yes (50000-50002) | No |
| VCDJ announcement | Yes | No |
| Coexists with Rekordbox | No | Yes |
| Requires root/sudo | No | Yes |
| Device control | Yes | No |
| Track metadata | Yes | Yes (via NFS/RemoteDB) |
| Works with USB devices | Limited | Yes |
