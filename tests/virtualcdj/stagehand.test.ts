import {Socket} from 'dgram';

import DeviceManager from 'src/devices';
import {DeviceType} from 'src/types';
import {
  generateStagehandDeviceId,
  generateStagehandMac,
  getVirtualStagehand,
  makeStagehand0aPacket,
  makeStagehand02Packet,
  makeStagehand06Packet,
  StagehandAnnouncer,
} from 'src/virtualcdj/stagehand';

describe('Stagehand Connection Method', () => {
  const mockIface = {
    address: '192.168.1.100',
    mac: '00:11:22:33:44:55',
    family: 'IPv4' as const,
    netmask: '255.255.255.0',
    internal: false,
    cidr: '192.168.1.100/24',
    scopeid: undefined,
  };

  describe('Utility generators', () => {
    it('should generate valid AlphaTheta-OUI MAC address', () => {
      const mac = generateStagehandMac();
      expect(mac).toBeInstanceOf(Uint8Array);
      expect(mac.length).toBe(6);
      expect(mac[0]).toBe(0xc8);
      expect(mac[1]).toBe(0x3d);
      expect(mac[2]).toBe(0xfc);
    });

    it('should generate random device ID in 141-211 range', () => {
      for (let i = 0; i < 50; i++) {
        const id = generateStagehandDeviceId();
        expect(id).toBeGreaterThanOrEqual(141);
        expect(id).toBeLessThanOrEqual(211);
      }
    });

    it('should create a valid Stagehand device', () => {
      const mac = generateStagehandMac();
      const device = getVirtualStagehand(mockIface, 150, 'Stagehand-Test', mac);
      expect(device.id).toBe(150);
      expect(device.name).toBe('Stagehand-Test');
      expect(device.type).toBe(DeviceType.Stagehand);
      expect(device.macAddr).toBe(mac);
      expect(device.ip.address).toBe('192.168.1.100');
    });
  });

  describe('Packet Builders', () => {
    it('should build exactly 37 bytes Stagehand 0x0a packet', () => {
      const device = getVirtualStagehand(mockIface, 150);
      const packet = makeStagehand0aPacket(device);
      expect(packet.length).toBe(37);
      expect(packet[10]).toBe(0x0a); // Type
      expect(packet[32]).toBe(0x01); // Protocol byte 1
      expect(packet[33]).toBe(0x03); // Protocol byte 2 (Stagehand uses 03)
      expect(packet[36]).toBe(DeviceType.Stagehand); // 0x05
    });

    it('should build exactly 50 bytes Stagehand 0x02 packet', () => {
      const mac = generateStagehandMac();
      const device = getVirtualStagehand(mockIface, 150, 'Stagehand', mac);
      const packet = makeStagehand02Packet(device, mac, 1);
      expect(packet.length).toBe(50);
      expect(packet[10]).toBe(0x02); // Type
      expect(packet[32]).toBe(0x01); // Protocol
      expect(packet[33]).toBe(0x03);
      expect(packet[46]).toBe(0x3a); // constant
      expect(packet[47]).toBe(1); // counter
      expect(packet[48]).toBe(DeviceType.Stagehand); // 0x05
      expect(packet[49]).toBe(0x01); // constant
    });

    it('should build exactly 54 bytes Stagehand 0x06 packet', () => {
      const mac = generateStagehandMac();
      const device = getVirtualStagehand(mockIface, 150, 'Stagehand', mac);
      const packet = makeStagehand06Packet(device, mac);
      expect(packet.length).toBe(54);
      expect(packet[10]).toBe(0x06); // Type
      expect(packet[32]).toBe(0x01); // Protocol
      expect(packet[33]).toBe(0x03);
      expect(packet[36]).toBe(150); // device ID
      expect(packet[52]).toBe(DeviceType.Stagehand); // 0x05
      expect(packet[53]).toBe(0x20); // trailing byte
    });
  });

  describe('StagehandAnnouncer Lifecycle', () => {
    it('should start and stop announcer and send packets', () => {
      const mac = generateStagehandMac();
      const device = getVirtualStagehand(mockIface, 150, 'Stagehand', mac);
      const mockSocket = {
        send: jest.fn(),
      } as any as Socket;
      const mockDeviceManager = {devices: new Map()} as any as DeviceManager;

      const announcer = new StagehandAnnouncer(
        device,
        mockSocket,
        mockDeviceManager,
        mockIface
      );

      announcer.start();
      expect(mockSocket.send).toHaveBeenCalled();
      announcer.stop();
    });
  });
});
