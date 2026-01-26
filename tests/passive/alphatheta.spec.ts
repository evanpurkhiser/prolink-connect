import {type NetworkInterfaceInfo, type NetworkInterfaceInfoIPv4} from 'os';

import {
  findAlphaThetaInterface,
  findAllAlphaThetaInterfaces,
  getArpCacheForInterface,
} from 'src/passive/alphatheta';

// Mock child_process and os modules
jest.mock('child_process');
jest.mock('os');

import {execSync} from 'child_process';
import {networkInterfaces} from 'os';

const execSyncMock = execSync as jest.MockedFunction<typeof execSync>;
const networkInterfacesMock = networkInterfaces as jest.MockedFunction<typeof networkInterfaces>;

// Helper to create mock NetworkInterfaceInfo
function mockNetworkInterfaceInfo(
  overrides: Partial<NetworkInterfaceInfoIPv4> = {}
): NetworkInterfaceInfoIPv4 {
  return {
    address: '192.168.1.100',
    netmask: '255.255.255.0',
    family: 'IPv4' as const,
    mac: '00:11:22:33:44:55',
    internal: false,
    cidr: '192.168.1.100/24',
    ...overrides,
  };
}

describe('alphatheta', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {value: originalPlatform});
  });

  describe('findAlphaThetaInterface', () => {
    it('returns first interface from findAllAlphaThetaInterfaces', () => {
      Object.defineProperty(process, 'platform', {value: 'darwin'});

      // Mock ioreg showing AlphaTheta device
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd.includes('ioreg')) {
          return '"USB Vendor Name" = "AlphaTheta"\n"USB Product Name" = "XDJ-XZ"';
        }
        if (cmd.includes('networksetup')) {
          return `Hardware Port: USB 10/100 LAN
Device: en15
Ethernet Address: c8:3d:fc:0a:58:54`;
        }
        if (cmd.includes('arp')) {
          return '';
        }
        return '';
      });

      networkInterfacesMock.mockReturnValue({
        en15: [
          mockNetworkInterfaceInfo({
            address: '169.254.82.203',
            mac: 'c8:3d:fc:0a:58:54',
          }),
        ],
      });

      const result = findAlphaThetaInterface();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('en15');
      expect(result?.connectionType).toBe('usb');
    });

    it('returns null when no interfaces found', () => {
      Object.defineProperty(process, 'platform', {value: 'darwin'});

      // Mock ioreg showing no AlphaTheta device
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd.includes('ioreg')) {
          return '"USB Vendor Name" = "Apple"\n"USB Product Name" = "Keyboard"';
        }
        if (cmd.includes('arp')) {
          return '';
        }
        return '';
      });

      networkInterfacesMock.mockReturnValue({});

      const result = findAlphaThetaInterface();

      expect(result).toBeNull();
    });
  });

  describe('findAllAlphaThetaInterfaces', () => {
    describe('macOS USB detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {value: 'darwin'});
      });

      it('detects USB-connected AlphaTheta devices', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            return '"USB Vendor Name" = "AlphaTheta"\n"USB Product Name" = "XDJ-XZ"';
          }
          if (cmd.includes('networksetup')) {
            return `Hardware Port: USB 10/100 LAN
Device: en15
Ethernet Address: c8:3d:fc:0a:58:54`;
          }
          if (cmd.includes('arp')) {
            return '';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en15: [
            mockNetworkInterfaceInfo({
              address: '169.254.82.203',
              mac: 'c8:3d:fc:0a:58:54',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('en15');
        expect(results[0].connectionType).toBe('usb');
        expect(results[0].ipv4).toBe('169.254.82.203');
        expect(results[0].mac).toBe('c8:3d:fc:0a:58:54');
      });

      it('detects multiple USB interfaces', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            return '"USB Vendor Name" = "AlphaTheta"\n"USB Product Name" = "XDJ-XZ"';
          }
          if (cmd.includes('networksetup')) {
            return `Hardware Port: USB 10/100 LAN
Device: en15
Ethernet Address: c8:3d:fc:0a:58:54

Hardware Port: USB 10/100 LAN
Device: en16
Ethernet Address: c8:3d:fc:0b:59:55`;
          }
          if (cmd.includes('arp')) {
            return '';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en15: [
            mockNetworkInterfaceInfo({
              address: '169.254.82.203',
              mac: 'c8:3d:fc:0a:58:54',
            }),
          ],
          en16: [
            mockNetworkInterfaceInfo({
              address: '169.254.82.204',
              mac: 'c8:3d:fc:0b:59:55',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(2);
        expect(results[0].name).toBe('en15');
        expect(results[1].name).toBe('en16');
      });

      it('returns empty array when no AlphaTheta USB device connected', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            return '"USB Vendor Name" = "Apple"\n"USB Product Name" = "Keyboard"';
          }
          if (cmd.includes('arp')) {
            return '';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({});

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(0);
      });

      it('handles USB 10_100 LAN naming variant', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            return '"USB Vendor Name" = "AlphaTheta"';
          }
          if (cmd.includes('networksetup')) {
            return `Hardware Port: USB 10_100 LAN
Device: en15
Ethernet Address: c8:3d:fc:0a:58:54`;
          }
          if (cmd.includes('arp')) {
            return '';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en15: [
            mockNetworkInterfaceInfo({
              address: '169.254.82.203',
              mac: 'c8:3d:fc:0a:58:54',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('en15');
      });
    });

    describe('Ethernet detection via ARP cache', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {value: 'darwin'});
      });

      it('detects devices via ARP cache with AlphaTheta MAC prefix', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            // No USB device
            throw new Error('No USB device');
          }
          if (cmd.includes('arp')) {
            return '? (192.168.1.119) at c8:3d:fc:11:22:33 on en0 ifscope [ethernet]';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en0: [
            mockNetworkInterfaceInfo({
              address: '192.168.1.100',
              mac: '00:11:22:33:44:55',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('en0');
        expect(results[0].connectionType).toBe('ethernet');
        expect(results[0].deviceIps).toContain('192.168.1.119');
      });

      it('detects devices with Pioneer DJ MAC prefix (74:5e:1c)', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            throw new Error('No USB device');
          }
          if (cmd.includes('arp')) {
            return '? (192.168.1.50) at 74:5e:1c:aa:bb:cc on en0 ifscope [ethernet]';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en0: [
            mockNetworkInterfaceInfo({
              address: '192.168.1.100',
              mac: '00:11:22:33:44:55',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].deviceIps).toContain('192.168.1.50');
      });

      it('detects multiple devices on same interface', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            throw new Error('No USB device');
          }
          if (cmd.includes('arp')) {
            return `? (192.168.1.119) at c8:3d:fc:11:22:33 on en0 ifscope [ethernet]
? (192.168.1.120) at c8:3d:fc:44:55:66 on en0 ifscope [ethernet]`;
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en0: [
            mockNetworkInterfaceInfo({
              address: '192.168.1.100',
              mac: '00:11:22:33:44:55',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].deviceIps).toHaveLength(2);
        expect(results[0].deviceIps).toContain('192.168.1.119');
        expect(results[0].deviceIps).toContain('192.168.1.120');
      });

      it('detects devices on multiple interfaces', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            throw new Error('No USB device');
          }
          if (cmd.includes('arp')) {
            return `? (192.168.1.119) at c8:3d:fc:11:22:33 on en0 ifscope [ethernet]
? (10.0.0.50) at 74:5e:1c:aa:bb:cc on en1 ifscope [ethernet]`;
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en0: [
            mockNetworkInterfaceInfo({
              address: '192.168.1.100',
              mac: '00:11:22:33:44:55',
            }),
          ],
          en1: [
            mockNetworkInterfaceInfo({
              address: '10.0.0.100',
              mac: 'aa:bb:cc:dd:ee:ff',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(2);
        expect(results.map(r => r.name)).toContain('en0');
        expect(results.map(r => r.name)).toContain('en1');
      });

      it('ignores non-AlphaTheta MAC addresses in ARP cache', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            throw new Error('No USB device');
          }
          if (cmd.includes('arp')) {
            return '? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en0: [mockNetworkInterfaceInfo()],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(0);
      });
    });

    describe('combined USB and Ethernet detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {value: 'darwin'});
      });

      it('returns USB interfaces first, then Ethernet', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            return '"USB Vendor Name" = "AlphaTheta"';
          }
          if (cmd.includes('networksetup')) {
            return `Hardware Port: USB 10/100 LAN
Device: en15
Ethernet Address: c8:3d:fc:0a:58:54`;
          }
          if (cmd.includes('arp')) {
            return '? (192.168.1.119) at c8:3d:fc:11:22:33 on en0 ifscope [ethernet]';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en0: [
            mockNetworkInterfaceInfo({
              address: '192.168.1.100',
              mac: '00:11:22:33:44:55',
            }),
          ],
          en15: [
            mockNetworkInterfaceInfo({
              address: '169.254.82.203',
              mac: 'c8:3d:fc:0a:58:54',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(2);
        expect(results[0].name).toBe('en15');
        expect(results[0].connectionType).toBe('usb');
        expect(results[1].name).toBe('en0');
        expect(results[1].connectionType).toBe('ethernet');
      });

      it('deduplicates interfaces found via both methods', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            return '"USB Vendor Name" = "AlphaTheta"';
          }
          if (cmd.includes('networksetup')) {
            return `Hardware Port: USB 10/100 LAN
Device: en15
Ethernet Address: c8:3d:fc:0a:58:54`;
          }
          if (cmd.includes('arp')) {
            // Same interface appears in ARP cache too
            return '? (169.254.88.83) at c8:3d:fc:0a:58:55 on en15 ifscope [ethernet]';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          en15: [
            mockNetworkInterfaceInfo({
              address: '169.254.82.203',
              mac: 'c8:3d:fc:0a:58:54',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        // Should only have one entry for en15, not two
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('en15');
        expect(results[0].connectionType).toBe('usb');
      });
    });

    describe('Windows detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {value: 'win32'});
      });

      it('detects USB-connected devices via PowerShell', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('powershell')) {
            return JSON.stringify({
              Name: 'Ethernet 3',
              MacAddress: 'C8-3D-FC-0A-58-54',
              InterfaceDescription: 'USB 10/100 LAN',
            });
          }
          if (cmd.includes('arp')) {
            return '';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          'Ethernet 3': [
            mockNetworkInterfaceInfo({
              address: '169.254.82.203',
              mac: 'c8:3d:fc:0a:58:54',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Ethernet 3');
        expect(results[0].connectionType).toBe('usb');
      });

      it('detects multiple USB adapters', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('powershell')) {
            return JSON.stringify([
              {
                Name: 'Ethernet 3',
                MacAddress: 'C8-3D-FC-0A-58-54',
                InterfaceDescription: 'USB 10/100 LAN',
              },
              {
                Name: 'Ethernet 4',
                MacAddress: '74-5E-1C-AA-BB-CC',
                InterfaceDescription: 'Pioneer DJ Adapter',
              },
            ]);
          }
          if (cmd.includes('arp')) {
            return '';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          'Ethernet 3': [
            mockNetworkInterfaceInfo({
              address: '169.254.82.203',
              mac: 'c8:3d:fc:0a:58:54',
            }),
          ],
          'Ethernet 4': [
            mockNetworkInterfaceInfo({
              address: '169.254.82.204',
              mac: '74:5e:1c:aa:bb:cc',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(2);
      });

      it('detects devices via Windows ARP cache', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('powershell')) {
            return '';
          }
          if (cmd.includes('arp')) {
            return `Interface: 192.168.1.100 --- 0x5
  Internet Address      Physical Address      Type
  192.168.1.119         c8-3d-fc-11-22-33     dynamic`;
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          Ethernet: [
            mockNetworkInterfaceInfo({
              address: '192.168.1.100',
              mac: '00:11:22:33:44:55',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].connectionType).toBe('ethernet');
        expect(results[0].deviceIps).toContain('192.168.1.119');
      });
    });

    describe('Linux detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {value: 'linux'});
      });

      it('detects devices via Linux ARP cache', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('arp')) {
            return '? (192.168.1.119) at c8:3d:fc:11:22:33 [ether] on eth0';
          }
          return '';
        });

        networkInterfacesMock.mockReturnValue({
          eth0: [
            mockNetworkInterfaceInfo({
              address: '192.168.1.100',
              mac: '00:11:22:33:44:55',
            }),
          ],
        });

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('eth0');
        expect(results[0].connectionType).toBe('ethernet');
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {value: 'darwin'});
      });

      it('handles execSync failures gracefully', () => {
        execSyncMock.mockImplementation(() => {
          throw new Error('Command failed');
        });

        networkInterfacesMock.mockReturnValue({});

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(0);
      });

      it('handles missing network interfaces gracefully', () => {
        execSyncMock.mockImplementation((cmd: string) => {
          if (cmd.includes('ioreg')) {
            return '"USB Vendor Name" = "AlphaTheta"';
          }
          if (cmd.includes('networksetup')) {
            return `Hardware Port: USB 10/100 LAN
Device: en15
Ethernet Address: c8:3d:fc:0a:58:54`;
          }
          if (cmd.includes('arp')) {
            return '';
          }
          return '';
        });

        // Interface not present in Node.js networkInterfaces
        networkInterfacesMock.mockReturnValue({});

        const results = findAllAlphaThetaInterfaces();

        expect(results).toHaveLength(0);
      });
    });
  });

  describe('getArpCacheForInterface', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {value: 'darwin'});
    });

    it('returns IPs from ARP cache for specified interface', () => {
      execSyncMock.mockReturnValue(
        `? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
? (192.168.1.119) at c8:3d:fc:11:22:33 on en0 ifscope [ethernet]
? (10.0.0.1) at 11:22:33:44:55:66 on en1 ifscope [ethernet]`
      );

      const ips = getArpCacheForInterface('en0');

      expect(ips).toHaveLength(2);
      expect(ips).toContain('192.168.1.1');
      expect(ips).toContain('192.168.1.119');
      expect(ips).not.toContain('10.0.0.1');
    });

    it('returns empty array when interface not in ARP cache', () => {
      execSyncMock.mockReturnValue(
        '? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]'
      );

      const ips = getArpCacheForInterface('en15');

      expect(ips).toHaveLength(0);
    });

    it('returns empty array on error', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const ips = getArpCacheForInterface('en0');

      expect(ips).toHaveLength(0);
    });
  });
});
