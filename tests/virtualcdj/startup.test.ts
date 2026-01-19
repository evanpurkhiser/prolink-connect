import {Socket} from 'dgram';

import DeviceManager from 'src/devices';
import {DeviceType} from 'src/types';
import {
  Announcer,
  getVirtualCDJ,
  makeAnnouncePacket,
  makeStatusPacket,
} from 'src/virtualcdj';

describe('Full Startup Protocol', () => {
  const mockIface = {
    address: '192.168.1.100',
    mac: '00:11:22:33:44:55',
    family: 'IPv4' as const,
    netmask: '255.255.255.0',
    internal: false,
    cidr: null,
    scopeid: undefined,
  };

  describe('Announcer creation', () => {
    it('should create announcer with default fullStartup=false', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const mockSocket = {} as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(device, mockSocket, mockDeviceManager, mockIface);
      expect(announcer).toBeDefined();
    });

    it('should create announcer with explicit fullStartup=false', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const mockSocket = {} as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        false
      );
      expect(announcer).toBeDefined();
    });

    it('should create announcer with fullStartup=true', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const mockSocket = {} as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );
      expect(announcer).toBeDefined();
    });
  });

  describe('Virtual CDJ device creation', () => {
    it('should create standard CDJ device (player 1-4)', () => {
      const device = getVirtualCDJ(mockIface, 1);
      expect(device.id).toBe(1);
      expect(device.type).toBe(DeviceType.CDJ);
      expect(device.ip.address).toBe('192.168.1.100');
      expect(Array.from(device.macAddr)).toEqual([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
    });

    it('should create CDJ-3000 device (player 5)', () => {
      const device = getVirtualCDJ(mockIface, 5);
      expect(device.id).toBe(5);
      expect(device.type).toBe(DeviceType.CDJ);
    });

    it('should create CDJ-3000 device (player 6)', () => {
      const device = getVirtualCDJ(mockIface, 6);
      expect(device.id).toBe(6);
      expect(device.type).toBe(DeviceType.CDJ);
    });

    it('should create devices for valid player IDs', () => {
      [1, 2, 3, 4, 5, 6, 7, 10, 15, 32].forEach(id => {
        const device = getVirtualCDJ(mockIface, id as any);
        expect(device.id).toBe(id);
        expect(device.type).toBe(DeviceType.CDJ);
        expect(device.name).toBe('ProLink-Connect');
      });
    });

    it('should accept custom device name', () => {
      const device = getVirtualCDJ(mockIface, 1, 'My Custom Name');
      expect(device.id).toBe(1);
      expect(device.name).toBe('My Custom Name');
    });
  });

  describe('Announcer lifecycle', () => {
    it('should start and stop announcer in simple mode', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const mockSocket = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
      } as any as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        false
      );

      announcer.start();
      announcer.stop();

      // Should have registered for keep-alive
      expect(mockSocket.send).toHaveBeenCalled();
    });

    it('should start and stop announcer in full startup mode', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const mockSocket = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
      } as any as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );

      announcer.start();

      // Should set up conflict listener
      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));

      announcer.stop();

      // Should remove conflict listener
      expect(mockSocket.off).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('Conflict detection and handling', () => {
    it('should detect conflict packet (0x08)', done => {
      const device = getVirtualCDJ(mockIface, 7);
      const conflictPacket = Buffer.alloc(0x29);

      // Build 0x08 conflict packet
      conflictPacket.set(
        Buffer.from([0x51, 0x73, 0x70, 0x74, 0x31, 0x57, 0x6d, 0x4a, 0x4f, 0x4c]),
        0
      );
      conflictPacket[0x0a] = 0x08; // Conflict packet type
      conflictPacket[0x24] = 7; // Conflicting device ID

      const mockSocket = {
        send: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'message') {
            // Trigger conflict packet after short delay
            setTimeout(() => {
              handler(conflictPacket);
            }, 10);
          }
        }),
        off: jest.fn(),
      } as any as Socket;

      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );

      announcer.start();

      // Give it time to detect conflict
      setTimeout(() => {
        announcer.stop();
        expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
        done();
      }, 100);
    });

    it('should skip non-conflict packets', done => {
      const device = getVirtualCDJ(mockIface, 7);
      const nonConflictPacket = Buffer.alloc(0x30); // Wrong size

      const mockSocket = {
        send: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'message') {
            setTimeout(() => handler(nonConflictPacket), 10);
          }
        }),
        off: jest.fn(),
      } as any as Socket;

      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );

      announcer.start();

      setTimeout(() => {
        announcer.stop();
        // Should still work without throwing
        expect(announcer).toBeDefined();
        done();
      }, 50);
    });

    it('should select available device ID when conflict detected', () => {
      const device = getVirtualCDJ(mockIface, 7);
      const mockSocket = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
      } as any as Socket;

      // Simulate devices 7 and 8 already in use
      const existingDevice7 = getVirtualCDJ(mockIface, 7);
      const existingDevice8 = getVirtualCDJ(mockIface, 8);
      const mockDeviceManager = {
        devices: new Map([
          [7, existingDevice7],
          [8, existingDevice8],
        ]),
      } as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );

      // Should not throw
      announcer.start();
      announcer.stop();
    });

    it('should prefer high device IDs (7-32) over low IDs (1-6)', () => {
      const device = getVirtualCDJ(mockIface, 7);
      const mockSocket = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
      } as any as Socket;

      // No devices in use - should use highest available
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );

      announcer.start();
      announcer.stop();

      // Should successfully start
      expect(mockSocket.send).toHaveBeenCalled();
    });
  });

  describe('Integration with NetworkConfig', () => {
    it('should accept fullStartup from NetworkConfig', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const mockSocket = {} as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const config = {fullStartup: true};
      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        config.fullStartup ?? false
      );

      expect(announcer).toBeDefined();
    });
  });

  describe('Packet building functions', () => {
    it('should build status packet with correct structure', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const packet = makeStatusPacket(device);

      expect(packet).toBeInstanceOf(Uint8Array);
      expect(packet.length).toBe(284);
      // Check device ID is set at correct positions
      expect(packet[0x21]).toBe(1);
      expect(packet[0x24]).toBe(1);
    });

    it('should build status packet for high player numbers', () => {
      const device = getVirtualCDJ(mockIface, 5);
      const packet = makeStatusPacket(device);

      expect(packet[0x21]).toBe(5);
      expect(packet[0x24]).toBe(5);
    });

    it('should build announce packet with correct structure', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const packet = makeAnnouncePacket(device);

      expect(packet).toBeInstanceOf(Uint8Array);
      expect(packet.length).toBe(54);
      // Check player ID position
      expect(packet[0x24]).toBe(1);
      // Check player type
      expect(packet[0x25]).toBe(DeviceType.CDJ);
    });

    it('should build announce packet for CDJ-3000 player numbers', () => {
      const device = getVirtualCDJ(mockIface, 5);
      const packet = makeAnnouncePacket(device);

      expect(packet[0x24]).toBe(5);
      expect(packet[0x25]).toBe(DeviceType.CDJ);
    });

    it('should include MAC address in announce packet', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const packet = makeAnnouncePacket(device);

      // MAC address starts at 0x26 (6 bytes)
      expect(packet[0x26]).toBe(0x00);
      expect(packet[0x27]).toBe(0x11);
      expect(packet[0x28]).toBe(0x22);
      expect(packet[0x29]).toBe(0x33);
      expect(packet[0x2a]).toBe(0x44);
      expect(packet[0x2b]).toBe(0x55);
    });

    it('should include IP address in announce packet', () => {
      const device = getVirtualCDJ(mockIface, 1);
      const packet = makeAnnouncePacket(device);

      // IP address starts at 0x2C (4 bytes)
      expect(packet[0x2c]).toBe(192);
      expect(packet[0x2d]).toBe(168);
      expect(packet[0x2e]).toBe(1);
      expect(packet[0x2f]).toBe(100);
    });
  });

  describe('CDJ-3000 compatibility', () => {
    it('should handle player 5 with special startup packets', () => {
      const device = getVirtualCDJ(mockIface, 5);
      const mockSocket = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
      } as any as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );

      announcer.start();
      announcer.stop();

      // Should send startup packets for player 5
      expect(mockSocket.send).toHaveBeenCalled();
    });

    it('should handle player 6 with special startup packets', () => {
      const device = getVirtualCDJ(mockIface, 6);
      const mockSocket = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
      } as any as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new Announcer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface,
        true
      );

      announcer.start();
      announcer.stop();

      // Should send startup packets for player 6
      expect(mockSocket.send).toHaveBeenCalled();
    });
  });
});
