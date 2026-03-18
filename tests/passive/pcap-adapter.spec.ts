import {type NetworkInterfaceInfoIPv4} from 'os';

// The resolveWindowsInterface function is module-private in pcap-adapter.ts.
// We test it indirectly through PcapAdapter.start(), but we can also test the
// resolution logic by mocking os.networkInterfaces and the cap module.

// Mock os and cap before importing
jest.mock('os');
jest.mock('cap', () => {
  // Return a mock that tracks open() calls so we can verify the device name
  const mockCap = {
    open: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
    setMinBytes: jest.fn(),
  };
  return {
    Cap: Object.assign(
      jest.fn(() => mockCap),
      {
        deviceList: jest.fn(),
        __mockInstance: mockCap,
      }
    ),
    decoders: {
      PROTOCOL: {
        ETHERNET: {IPV4: 0x0800},
        IP: {UDP: 17},
      },
      Ethernet: jest.fn(),
      IPV4: jest.fn(),
      UDP: jest.fn(),
    },
  };
});

import {networkInterfaces} from 'os';
import {PcapAdapter} from 'src/passive/pcap-adapter';

const networkInterfacesMock = networkInterfaces as jest.MockedFunction<typeof networkInterfaces>;

// Access the mocked cap module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const capMock = require('cap');
const CapConstructor = capMock.Cap;
const mockCapInstance = CapConstructor.__mockInstance;

function mockIPv4Interface(
  address: string,
  mac = '00:11:22:33:44:55'
): NetworkInterfaceInfoIPv4 {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4' as const,
    mac,
    internal: false,
    cidr: `${address}/24`,
  };
}

describe('PcapAdapter', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCapInstance.open.mockReset();
    mockCapInstance.on.mockReset();
    mockCapInstance.setMinBytes.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {value: originalPlatform});
  });

  describe('resolveWindowsInterface (via start())', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {value: 'win32'});
    });

    it('translates Node.js interface name to Npcap device path by matching IPv4', () => {
      networkInterfacesMock.mockReturnValue({
        Ethernet: [mockIPv4Interface('192.168.1.211')],
      });

      CapConstructor.deviceList.mockReturnValue([
        {
          name: '\\Device\\NPF_{AAAA-BBBB}',
          description: 'Loopback',
          addresses: [{addr: '127.0.0.1'}],
        },
        {
          name: '\\Device\\NPF_{1234-5678}',
          description: 'Intel Ethernet',
          addresses: [{addr: '192.168.1.211'}],
        },
      ]);

      const adapter = new PcapAdapter({iface: 'Ethernet'});
      adapter.start();

      // Should have opened the NPF device, not "Ethernet"
      expect(mockCapInstance.open).toHaveBeenCalledWith(
        '\\Device\\NPF_{1234-5678}',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });

    it('falls back to original name when no matching cap device found', () => {
      networkInterfacesMock.mockReturnValue({
        Ethernet: [mockIPv4Interface('192.168.1.211')],
      });

      CapConstructor.deviceList.mockReturnValue([
        {
          name: '\\Device\\NPF_{AAAA-BBBB}',
          description: 'Loopback',
          addresses: [{addr: '127.0.0.1'}],
        },
      ]);

      const adapter = new PcapAdapter({iface: 'Ethernet'});

      // This will fail to open, but we can verify the name passed
      try {
        adapter.start();
      } catch {
        // Expected to fail since mock open may throw
      }

      // Should have tried "Ethernet" since no match was found
      expect(mockCapInstance.open).toHaveBeenCalledWith(
        'Ethernet',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });

    it('falls back to original name when Node.js interface not found', () => {
      networkInterfacesMock.mockReturnValue({
        WiFi: [mockIPv4Interface('10.0.0.1')],
      });

      CapConstructor.deviceList.mockReturnValue([]);

      const adapter = new PcapAdapter({iface: 'Ethernet'});

      try {
        adapter.start();
      } catch {
        // Expected
      }

      expect(mockCapInstance.open).toHaveBeenCalledWith(
        'Ethernet',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });

    it('falls back when interface has no IPv4 addresses', () => {
      networkInterfacesMock.mockReturnValue({
        Ethernet: [
          {
            address: 'fe80::1',
            netmask: 'ffff:ffff:ffff:ffff::',
            family: 'IPv6' as const,
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: 'fe80::1/64',
            scopeid: 0,
          },
        ],
      });

      CapConstructor.deviceList.mockReturnValue([
        {
          name: '\\Device\\NPF_{1234}',
          description: 'test',
          addresses: [{addr: '192.168.1.1'}],
        },
      ]);

      const adapter = new PcapAdapter({iface: 'Ethernet'});

      try {
        adapter.start();
      } catch {
        // Expected
      }

      // No IPv4 match possible, should fall back to "Ethernet"
      expect(mockCapInstance.open).toHaveBeenCalledWith(
        'Ethernet',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });

    it('handles cap devices with no addresses', () => {
      networkInterfacesMock.mockReturnValue({
        Ethernet: [mockIPv4Interface('192.168.1.100')],
      });

      CapConstructor.deviceList.mockReturnValue([
        {name: '\\Device\\NPF_{NOADDR}', description: 'No addresses'},
        {
          name: '\\Device\\NPF_{MATCH}',
          description: 'Match',
          addresses: [{addr: '192.168.1.100'}],
        },
      ]);

      const adapter = new PcapAdapter({iface: 'Ethernet'});
      adapter.start();

      expect(mockCapInstance.open).toHaveBeenCalledWith(
        '\\Device\\NPF_{MATCH}',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });

    it('matches first device when multiple cap devices share same address', () => {
      networkInterfacesMock.mockReturnValue({
        Ethernet: [mockIPv4Interface('192.168.1.100')],
      });

      CapConstructor.deviceList.mockReturnValue([
        {
          name: '\\Device\\NPF_{FIRST}',
          description: 'First',
          addresses: [{addr: '192.168.1.100'}],
        },
        {
          name: '\\Device\\NPF_{SECOND}',
          description: 'Second',
          addresses: [{addr: '192.168.1.100'}],
        },
      ]);

      const adapter = new PcapAdapter({iface: 'Ethernet'});
      adapter.start();

      expect(mockCapInstance.open).toHaveBeenCalledWith(
        '\\Device\\NPF_{FIRST}',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });
  });

  describe('non-Windows platforms', () => {
    it('does not translate interface name on macOS', () => {
      Object.defineProperty(process, 'platform', {value: 'darwin'});

      networkInterfacesMock.mockReturnValue({
        en0: [mockIPv4Interface('192.168.1.100')],
      });

      CapConstructor.deviceList.mockReturnValue([]);

      const adapter = new PcapAdapter({iface: 'en0'});
      adapter.start();

      // Should pass 'en0' directly without resolution
      expect(mockCapInstance.open).toHaveBeenCalledWith(
        'en0',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });

    it('does not translate interface name on Linux', () => {
      Object.defineProperty(process, 'platform', {value: 'linux'});

      networkInterfacesMock.mockReturnValue({
        eth0: [mockIPv4Interface('10.0.0.5')],
      });

      CapConstructor.deviceList.mockReturnValue([]);

      const adapter = new PcapAdapter({iface: 'eth0'});
      adapter.start();

      expect(mockCapInstance.open).toHaveBeenCalledWith(
        'eth0',
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });
  });

  describe('Windows device path passthrough', () => {
    it('does not translate names that already start with \\Device\\', () => {
      Object.defineProperty(process, 'platform', {value: 'win32'});

      networkInterfacesMock.mockReturnValue({});
      CapConstructor.deviceList.mockReturnValue([]);

      const devicePath = '\\Device\\NPF_{ALREADY-RESOLVED}';
      const adapter = new PcapAdapter({iface: devicePath});
      adapter.start();

      expect(mockCapInstance.open).toHaveBeenCalledWith(
        devicePath,
        expect.any(String),
        expect.any(Number),
        expect.any(Buffer)
      );
    });
  });
});
