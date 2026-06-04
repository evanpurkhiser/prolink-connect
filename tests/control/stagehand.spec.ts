import {Socket} from 'dgram';

import {BEAT_PORT, PROLINK_HEADER, STATUS_PORT} from 'src/constants';
import Control from 'src/control';
import {
  makeStagehandPrefWritePacket,
  makeStagehandTransportPacket,
} from 'src/control/stagehand';
import {CDJStatus, Device, DeviceType} from 'src/types';

describe('Stagehand Control', () => {
  const hostDevice: Device = {
    id: 154,
    name: 'Stagehand',
    type: DeviceType.Stagehand,
    ip: {address: '192.168.1.130'} as any,
    macAddr: new Uint8Array([0xc8, 0x3d, 0xfc, 0x01, 0x02, 0x03]),
  };

  const cdjDevice: Device = {
    id: 1,
    name: 'CDJ-3000',
    type: DeviceType.CDJ,
    ip: {address: '192.168.1.35'} as any,
    macAddr: new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]),
  };

  describe('makeStagehandTransportPacket', () => {
    it('should build a valid 56-byte 0x07 transport packet', () => {
      const op = 0x0f; // PLAY
      const press = true;
      const correlationByte = 0xa5;

      const packet = makeStagehandTransportPacket(hostDevice, op, press, correlationByte);

      expect(packet).toBeInstanceOf(Uint8Array);
      expect(packet.length).toBe(56);

      // Header matches magic
      expect(Buffer.from(packet.slice(0, 10))).toEqual(Buffer.from(PROLINK_HEADER));

      // Packet Type / Opcode
      expect(packet[10]).toBe(0x07);

      // Name matches padded hostDevice name
      expect(packet[11]).toBe(83); // 'S'
      expect(packet[19]).toBe(100); // 'd'
      expect(packet[20]).toBe(0); // padded zero

      // Constants
      expect(packet[31]).toBe(0x01);
      expect(packet[32]).toBe(0x03);

      // Correlation byte
      expect(packet[33]).toBe(correlationByte);

      // Body length 0x0030
      expect(packet[34]).toBe(0x00);
      expect(packet[35]).toBe(0x30);

      // Stagehand sub-id
      expect(packet[40]).toBe(0x3a);

      // Opcode
      expect(packet[44]).toBe(op);

      // Press / Release flag
      expect(packet[46]).toBe(0x01);
    });

    it('should support press=false as release flag', () => {
      const packet = makeStagehandTransportPacket(hostDevice, 0x1a, false, 0x12);
      expect(packet[46]).toBe(0x00);
    });
  });

  describe('makeStagehandPrefWritePacket', () => {
    it('should build a valid 124-byte 0x6b preference write packet', () => {
      const packet = makeStagehandPrefWritePacket(hostDevice, {
        onAir: 'on',
        quantize: 2,
      });

      expect(packet).toBeInstanceOf(Uint8Array);
      expect(packet.length).toBe(124);

      // Header matches magic
      expect(Buffer.from(packet.slice(0, 10))).toEqual(Buffer.from(PROLINK_HEADER));

      // Opcode
      expect(packet[10]).toBe(0x6b);

      // Name matches with trailing byte 30 set to 0x03
      expect(packet[11]).toBe(83); // 'S'
      expect(packet[30]).toBe(0x03); // Last byte of 20-byte field (index 19 of buildName)

      // Constants
      expect(packet[31]).toBe(0x01);
      expect(packet[32]).toBe(0x03);
      expect(packet[33]).toBe(0x3a);

      // Body length 0x0050
      expect(packet[34]).toBe(0x00);
      expect(packet[35]).toBe(0x50);

      // Transaction flag
      expect(packet[36]).toBe(0x01);

      // Preferences values
      expect(packet[44]).toBe(0x81); // onAir ON
      expect(packet[60]).toBe(0x82); // quantize index 2 (0x80 | 2)
    });

    it('should set onAir=off to 0x80', () => {
      const packet = makeStagehandPrefWritePacket(hostDevice, {onAir: 'off'});
      expect(packet[44]).toBe(0x80);
    });
  });

  describe('Control Class Integration', () => {
    let mockSocket: Socket;

    beforeEach(() => {
      mockSocket = {
        send: jest.fn((...args: any[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            cb(null, 100);
          }
        }),
      } as any as Socket;
    });

    it('setPlayState should delegate to Stagehand transport commands when host is Stagehand', async () => {
      const control = new Control(mockSocket, hostDevice);

      await control.setPlayState(cdjDevice, CDJStatus.PlayState.Playing);

      // Should have sent 2 packets: 0x0f and 0x14 on BEAT_PORT
      expect(mockSocket.send).toHaveBeenCalledTimes(2);

      const firstCall = (mockSocket.send as jest.Mock).mock.calls[0];
      expect(firstCall[1]).toBe(BEAT_PORT);
      expect(firstCall[2]).toBe('192.168.1.35');

      const secondCall = (mockSocket.send as jest.Mock).mock.calls[1];
      expect(secondCall[1]).toBe(BEAT_PORT);
      expect(secondCall[2]).toBe('192.168.1.35');
    });

    it('setPlayState should send standard active packet when host is CDJ', async () => {
      const regularHostDevice: Device = {
        id: 7,
        name: 'ProLink-Connect',
        type: DeviceType.CDJ,
        ip: {address: '192.168.1.50'} as any,
        macAddr: new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]),
      };

      const control = new Control(mockSocket, regularHostDevice);

      await control.setPlayState(cdjDevice, CDJStatus.PlayState.Playing);

      // Should have sent exactly 1 packet
      expect(mockSocket.send).toHaveBeenCalledTimes(1);

      const call = (mockSocket.send as jest.Mock).mock.calls[0];
      expect(call[1]).toBe(BEAT_PORT);
      expect(call[2]).toBe('192.168.1.35');
    });

    it('should expose seek, skip and setPreference on Control', async () => {
      const control = new Control(mockSocket, hostDevice);

      await control.seekForward(cdjDevice, true);
      await control.seekBackward(cdjDevice, false);
      await control.skip(cdjDevice, true);
      await control.setPreference(cdjDevice, {onAir: 'on'});

      // 4 calls (seekForward, seekBackward, skip, setPreference)
      expect(mockSocket.send).toHaveBeenCalledTimes(4);

      // Last call is setPreference on STATUS_PORT
      const lastCall = (mockSocket.send as jest.Mock).mock.calls[3];
      expect(lastCall[1]).toBe(STATUS_PORT);
      expect(lastCall[2]).toBe('192.168.1.35');
    });
  });
});
