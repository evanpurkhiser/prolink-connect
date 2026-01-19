/**
 * Cross-platform utilities for detecting AlphaTheta (Pioneer DJ) network interfaces.
 * Supports both USB-connected devices (XDJ-XZ, XDJ-AZ) and Ethernet-connected devices.
 */

import {execSync} from 'child_process';
import {type NetworkInterfaceInfo, networkInterfaces} from 'os';

/**
 * Known MAC address prefixes (OUI) for AlphaTheta/Pioneer DJ devices.
 * These are used to identify devices on the network via ARP cache.
 */
const ALPHATHETA_MAC_PREFIXES = [
  'c8:3d:fc', // AlphaTheta (XDJ-XZ, etc.)
  '74:5e:1c', // Pioneer DJ
  'ac:b5:7d', // Pioneer DJ
  'b8:e8:56', // Pioneer DJ
  '00:e0:4c', // Realtek (used in some Pioneer devices)
];

/**
 * Check if a MAC address belongs to an AlphaTheta/Pioneer device.
 */
function isAlphaThetaMac(mac: string): boolean {
  const normalizedMac = mac.toLowerCase();
  return ALPHATHETA_MAC_PREFIXES.some(prefix => normalizedMac.startsWith(prefix));
}

/**
 * Check if a network interface info is IPv4.
 * Handles both old (numeric) and new (string) Node.js family types.
 */
function isIPv4(info: NetworkInterfaceInfo): boolean {
  const family = info.family as any;
  return family === 'IPv4' || family === 4;
}

export interface AlphaThetaInterface {
  /** The interface name (e.g., "en15" on macOS, "Ethernet 3" on Windows) */
  name: string;
  /** The MAC address of the interface */
  mac: string;
  /** The IPv4 address of the host on this interface */
  ipv4?: string;
  /** The full NetworkInterfaceInfo from Node.js */
  info: NetworkInterfaceInfo;
  /** How the device is connected */
  connectionType: 'usb' | 'ethernet';
  /** IP addresses of AlphaTheta devices found on this interface */
  deviceIps?: string[];
}

/**
 * Find the network interface for an AlphaTheta device connected via USB or Ethernet.
 * Works on macOS, Windows, and Linux.
 *
 * Detection methods (tried in order):
 * 1. USB: Looks for USB-connected devices (XDJ-XZ, XDJ-AZ) via system APIs
 * 2. Ethernet: Checks ARP cache for known AlphaTheta/Pioneer MAC address prefixes
 *
 * This is useful for passive mode to automatically detect the correct interface
 * for AlphaTheta devices like XDJ-XZ, XDJ-AZ, CDJ-3000, etc.
 *
 * @example
 * ```typescript
 * import { findAlphaThetaInterface, bringOnlinePassive } from 'prolink-connect';
 *
 * const iface = findAlphaThetaInterface();
 * if (iface) {
 *   console.log(`Found AlphaTheta device on ${iface.name} (${iface.connectionType})`);
 *   const network = await bringOnlinePassive({ iface: iface.name });
 * }
 * ```
 *
 * @returns The AlphaTheta interface info, or null if not found
 */
export function findAlphaThetaInterface(): AlphaThetaInterface | null {
  const platform = process.platform;

  // Try USB detection first (more specific)
  let result: AlphaThetaInterface | null = null;

  if (platform === 'darwin') {
    result = findAlphaThetaInterfaceMacOS();
  } else if (platform === 'win32') {
    result = findAlphaThetaInterfaceWindows();
  }

  if (result) {
    return result;
  }

  // Fall back to Ethernet detection via ARP cache (works on all platforms)
  return findAlphaThetaViaEthernet();
}

/**
 * macOS implementation: Uses ioreg to find AlphaTheta USB devices,
 * then networksetup to map them to interface names.
 */
function findAlphaThetaInterfaceMacOS(): AlphaThetaInterface | null {
  try {
    // Step 1: Check if AlphaTheta USB device is connected
    const ioregOutput = execSync(
      'ioreg -p IOUSB -l -w 0 | grep -E \'"USB Vendor Name"|"USB Product Name"\'',
      {encoding: 'utf8', timeout: 5000}
    );

    if (!ioregOutput.toLowerCase().includes('alphatheta')) {
      return null;
    }

    // Step 2: Get all hardware ports and find USB 10/100 LAN adapters
    const networkSetupOutput = execSync('networksetup -listallhardwareports', {
      encoding: 'utf8',
      timeout: 5000,
    });

    // Parse the output to find USB LAN adapters
    // Format:
    // Hardware Port: USB 10/100 LAN
    // Device: en15
    // Ethernet Address: c8:3d:fc:0a:58:54
    const blocks = networkSetupOutput.split(/\n\n+/);
    const usbLanInterfaces: Array<{name: string; mac: string}> = [];

    for (const block of blocks) {
      if (block.includes('USB 10/100 LAN') || block.includes('USB 10_100 LAN')) {
        const deviceMatch = block.match(/Device:\s*(\S+)/);
        const macMatch = block.match(/Ethernet Address:\s*(\S+)/);

        if (deviceMatch && macMatch) {
          usbLanInterfaces.push({
            name: deviceMatch[1],
            mac: macMatch[1],
          });
        }
      }
    }

    if (usbLanInterfaces.length === 0) {
      return null;
    }

    // Step 3: Match with active network interfaces from Node.js
    const interfaces = networkInterfaces();

    for (const usbIface of usbLanInterfaces) {
      const nodeIface = interfaces[usbIface.name];
      if (!nodeIface) {
        continue;
      }

      // Find the IPv4 entry
      const ipv4Entry = nodeIface.find(isIPv4);

      if (ipv4Entry) {
        return {
          name: usbIface.name,
          mac: usbIface.mac,
          ipv4: ipv4Entry.address,
          info: ipv4Entry,
          connectionType: 'usb',
        };
      }

      // Even without IPv4, return the interface if it exists
      const firstEntry = nodeIface[0];
      if (firstEntry) {
        return {
          name: usbIface.name,
          mac: usbIface.mac,
          info: firstEntry,
          connectionType: 'usb',
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Windows implementation: Uses PowerShell to find AlphaTheta USB network adapters.
 */
function findAlphaThetaInterfaceWindows(): AlphaThetaInterface | null {
  try {
    // Use PowerShell to find USB network adapters from AlphaTheta
    // PnP devices with AlphaTheta in the manufacturer or description
    const psCommand = `
      Get-NetAdapter | Where-Object {
        $_.InterfaceDescription -like '*AlphaTheta*' -or
        $_.InterfaceDescription -like '*Pioneer*' -or
        $_.InterfaceDescription -like '*USB 10/100 LAN*'
      } | Select-Object -Property Name, MacAddress, InterfaceDescription | ConvertTo-Json
    `;

    const output = execSync(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });

    if (!output.trim()) {
      return null;
    }

    const adapters = JSON.parse(output);
    const adapterList = Array.isArray(adapters) ? adapters : [adapters];

    if (adapterList.length === 0) {
      return null;
    }

    const adapter = adapterList[0];
    const interfaces = networkInterfaces();

    // Windows interface names in Node.js might differ from PowerShell names
    // Try to match by MAC address
    const targetMac = adapter.MacAddress?.replace(/-/g, ':').toLowerCase();

    for (const [ifaceName, ifaceInfos] of Object.entries(interfaces)) {
      if (!ifaceInfos) {
        continue;
      }

      for (const info of ifaceInfos) {
        if (info.mac.toLowerCase() === targetMac) {
          const ipv4Entry = ifaceInfos.find(isIPv4);

          return {
            name: ifaceName,
            mac: info.mac,
            ipv4: ipv4Entry?.address,
            info: ipv4Entry || info,
            connectionType: 'usb',
          };
        }
      }
    }

    // Fallback: try matching by name directly
    const nodeIface = interfaces[adapter.Name];
    if (nodeIface) {
      const ipv4Entry = nodeIface.find(isIPv4);

      return {
        name: adapter.Name,
        mac: adapter.MacAddress,
        ipv4: ipv4Entry?.address,
        info: ipv4Entry || nodeIface[0],
        connectionType: 'usb',
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the device IP address from a link-local interface.
 *
 * When connected via USB, the device typically uses a link-local address
 * in the 169.254.x.x range. The device's IP can often be inferred from
 * the host's IP (they're usually on the same /16 subnet).
 *
 * @param hostIp - The host's IP address on the interface
 * @returns The likely device IP, or null if not determinable
 */
export function inferDeviceIpFromHost(hostIp: string): string | null {
  if (!hostIp.startsWith('169.254.')) {
    return null;
  }

  // The device is typically at a different address in the same subnet
  // Common patterns observed:
  // - Host: 169.254.82.203, Device: 169.254.88.83
  // - The device often has a lower IP in the range
  // Without ARP cache or actual discovery, we can't know for sure
  return null;
}

/**
 * Try to find the device IP by checking the ARP cache.
 * Works on macOS and Linux.
 *
 * @param interfaceName - The interface name to check
 * @returns Array of IP addresses found in ARP cache for this interface
 */
export function getArpCacheForInterface(interfaceName: string): string[] {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const arpOutput = execSync('arp -an', {encoding: 'utf8', timeout: 5000});

      const ips: string[] = [];
      const lines = arpOutput.split('\n');

      for (const line of lines) {
        // macOS format: ? (169.254.88.83) at c8:3d:fc:a:58:55 on en15 ifscope [ethernet]
        // Linux format: ? (169.254.88.83) at c8:3d:fc:a:58:55 [ether] on en15
        if (line.includes(interfaceName)) {
          const ipMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
          if (ipMatch) {
            ips.push(ipMatch[1]);
          }
        }
      }

      return ips;
    }
  } catch {
    // ARP command failed
  }

  return [];
}

/**
 * Parse the ARP cache and return entries with AlphaTheta MAC addresses.
 * Returns a map of interface name to array of {ip, mac} entries.
 */
function getAlphaThetaArpEntries(): Map<string, Array<{ip: string; mac: string}>> {
  const result = new Map<string, Array<{ip: string; mac: string}>>();

  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const arpOutput = execSync('arp -an', {encoding: 'utf8', timeout: 5000});
      const lines = arpOutput.split('\n');

      for (const line of lines) {
        // macOS format: ? (169.254.88.83) at c8:3d:fc:a:58:55 on en15 ifscope [ethernet]
        // Linux format: ? (169.254.88.83) at c8:3d:fc:a:58:55 [ether] on en15
        const ipMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
        const macMatch = line.match(/at\s+([0-9a-f:]+)/i);
        const ifaceMatch = line.match(/on\s+(\S+)/);

        if (ipMatch && macMatch && ifaceMatch) {
          const mac = macMatch[1];
          if (isAlphaThetaMac(mac)) {
            const ifaceName = ifaceMatch[1];
            const entries = result.get(ifaceName) || [];
            entries.push({ip: ipMatch[1], mac});
            result.set(ifaceName, entries);
          }
        }
      }
    } else if (process.platform === 'win32') {
      // Windows: use arp -a
      const arpOutput = execSync('arp -a', {encoding: 'utf8', timeout: 5000});
      const lines = arpOutput.split('\n');

      let currentInterface = '';
      for (const line of lines) {
        // Interface header: Interface: 192.168.1.100 --- 0x5
        const ifaceHeaderMatch = line.match(/Interface:\s+(\d+\.\d+\.\d+\.\d+)/);
        if (ifaceHeaderMatch) {
          currentInterface = ifaceHeaderMatch[1];
          continue;
        }

        // Entry: 192.168.1.1     00-11-22-33-44-55     dynamic
        const entryMatch = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f-]+)/i);
        if (entryMatch && currentInterface) {
          const mac = entryMatch[2].replace(/-/g, ':');
          if (isAlphaThetaMac(mac)) {
            const entries = result.get(currentInterface) || [];
            entries.push({ip: entryMatch[1], mac});
            result.set(currentInterface, entries);
          }
        }
      }
    }
  } catch {
    // ARP command failed
  }

  return result;
}

/**
 * Find an AlphaTheta device connected via Ethernet by checking the ARP cache
 * for known MAC address prefixes.
 */
function findAlphaThetaViaEthernet(): AlphaThetaInterface | null {
  const alphaThetaEntries = getAlphaThetaArpEntries();

  if (alphaThetaEntries.size === 0) {
    return null;
  }

  const interfaces = networkInterfaces();

  // Find the first interface that has AlphaTheta devices
  for (const [arpIfaceName, devices] of alphaThetaEntries) {
    // On Windows, ARP uses IP addresses as interface identifiers
    // We need to find the matching Node.js interface
    let nodeIfaceName = arpIfaceName;
    let nodeIface = interfaces[arpIfaceName];

    if (!nodeIface) {
      // Try to find interface by IP address (Windows case)
      for (const [ifName, infos] of Object.entries(interfaces)) {
        if (!infos) {
          continue;
        }
        for (const info of infos) {
          if (isIPv4(info) && info.address === arpIfaceName) {
            nodeIfaceName = ifName;
            nodeIface = infos;
            break;
          }
        }
        if (nodeIface) {
          break;
        }
      }
    }

    if (!nodeIface) {
      continue;
    }

    const ipv4Entry = nodeIface.find(isIPv4);
    if (!ipv4Entry) {
      continue;
    }

    return {
      name: nodeIfaceName,
      mac: ipv4Entry.mac,
      ipv4: ipv4Entry.address,
      info: ipv4Entry,
      connectionType: 'ethernet',
      deviceIps: devices.map(d => d.ip),
    };
  }

  return null;
}
