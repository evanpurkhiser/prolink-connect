import {onAirFromPacket} from 'src/status/utils';

describe('on-air packet parsing', () => {
  describe('4-channel variant (DJM-900/1000)', () => {
    it('should parse 4-channel on-air packet', () => {
      // Build a 4-channel on-air packet
      // Header: Qspt1WmJOL (10 bytes)
      const header = Buffer.from('Qspt1WmJOL', 'ascii');

      // Packet structure:
      // [0x00-0x09]: Header
      // [0x0a]: Type (0x06 for mixer updates)
      // [0x0b]: Unknown
      // [0x0c-0x1f]: Device name (padded with 00)
      // [0x20]: Subtype (0x00 for 4-channel)
      // [0x21]: Device ID (mixer = 0x21 / 33)
      // [0x22-0x23]: Length (0x0009)
      // [0x24]: F1 (Channel 1 on-air flag)
      // [0x25]: F2 (Channel 2 on-air flag)
      // [0x26]: F3 (Channel 3 on-air flag)
      // [0x27]: F4 (Channel 4 on-air flag)
      // [0x28-0x2d]: Padding

      const packet = Buffer.alloc(0x2e);
      header.copy(packet);
      packet[0x0a] = 0x06; // Type
      packet[0x20] = 0x00; // Subtype (4-channel)
      packet[0x21] = 0x21; // Device ID (mixer)
      packet.writeUInt16BE(0x0009, 0x22); // Length
      packet[0x24] = 0x01; // Channel 1: on-air
      packet[0x25] = 0x00; // Channel 2: off-air
      packet[0x26] = 0x01; // Channel 3: on-air
      packet[0x27] = 0x00; // Channel 4: off-air

      const onAir = onAirFromPacket(packet);

      expect(onAir).toBeDefined();
      expect(onAir!.deviceId).toBe(0x21);
      expect(onAir!.channels[1]).toBe(true);
      expect(onAir!.channels[2]).toBe(false);
      expect(onAir!.channels[3]).toBe(true);
      expect(onAir!.channels[4]).toBe(false);
      expect(onAir!.isSixChannel).toBe(false);
      expect(onAir!.channels[5]).toBeUndefined();
      expect(onAir!.channels[6]).toBeUndefined();
    });

    it('should return undefined for invalid 4-channel packet', () => {
      const header = Buffer.from('Qspt1WmJOL', 'ascii');
      const packet = Buffer.alloc(0x2e);
      header.copy(packet);
      packet[0x0a] = 0x06;
      packet[0x20] = 0x00;
      packet[0x21] = 0x21;
      packet.writeUInt16BE(0x0008, 0x22); // Wrong length

      const onAir = onAirFromPacket(packet);
      expect(onAir).toBeUndefined();
    });
  });

  describe('6-channel variant (CDJ-3000 + DJM-V10)', () => {
    it('should parse 6-channel on-air packet', () => {
      // Build a 6-channel on-air packet
      const header = Buffer.from('Qspt1WmJOL', 'ascii');
      const packet = Buffer.alloc(0x36);
      header.copy(packet);
      packet[0x0a] = 0x06; // Type
      packet[0x20] = 0x03; // Subtype (6-channel)
      packet[0x21] = 0x21; // Device ID (mixer)
      packet.writeUInt16BE(0x0011, 0x22); // Length (6-channel)
      packet[0x24] = 0x01; // Channel 1: on-air
      packet[0x25] = 0x01; // Channel 2: on-air
      packet[0x26] = 0x00; // Channel 3: off-air
      packet[0x27] = 0x01; // Channel 4: on-air
      packet[0x2e] = 0x00; // Channel 5: off-air
      packet[0x2f] = 0x01; // Channel 6: on-air

      const onAir = onAirFromPacket(packet);

      expect(onAir).toBeDefined();
      expect(onAir!.deviceId).toBe(0x21);
      expect(onAir!.channels[1]).toBe(true);
      expect(onAir!.channels[2]).toBe(true);
      expect(onAir!.channels[3]).toBe(false);
      expect(onAir!.channels[4]).toBe(true);
      expect(onAir!.channels[5]).toBe(false);
      expect(onAir!.channels[6]).toBe(true);
      expect(onAir!.isSixChannel).toBe(true);
    });

    it('should return undefined for invalid 6-channel packet', () => {
      const header = Buffer.from('Qspt1WmJOL', 'ascii');
      const packet = Buffer.alloc(0x36);
      header.copy(packet);
      packet[0x0a] = 0x06;
      packet[0x20] = 0x03;
      packet[0x21] = 0x21;
      packet.writeUInt16BE(0x0009, 0x22); // Wrong length for 6-channel

      const onAir = onAirFromPacket(packet);
      expect(onAir).toBeUndefined();
    });

    it('should return undefined if packet is too short', () => {
      const header = Buffer.from('Qspt1WmJOL', 'ascii');
      const packet = Buffer.alloc(0x30); // Too short
      header.copy(packet);
      packet[0x0a] = 0x06;
      packet[0x20] = 0x03;
      packet[0x21] = 0x21;
      packet.writeUInt16BE(0x0011, 0x22);

      const onAir = onAirFromPacket(packet);
      expect(onAir).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should return undefined for packet without prolink header', () => {
      const packet = Buffer.alloc(0x36);
      packet[0x20] = 0x03;
      packet[0x21] = 0x21;

      const onAir = onAirFromPacket(packet);
      expect(onAir).toBeUndefined();
    });

    it('should handle all channels on-air', () => {
      const header = Buffer.from('Qspt1WmJOL', 'ascii');
      const packet = Buffer.alloc(0x36);
      header.copy(packet);
      packet[0x0a] = 0x06;
      packet[0x20] = 0x03;
      packet[0x21] = 0x21;
      packet.writeUInt16BE(0x0011, 0x22);
      packet[0x24] = 0x01;
      packet[0x25] = 0x01;
      packet[0x26] = 0x01;
      packet[0x27] = 0x01;
      packet[0x2e] = 0x01;
      packet[0x2f] = 0x01;

      const onAir = onAirFromPacket(packet);

      expect(onAir!.channels[1]).toBe(true);
      expect(onAir!.channels[2]).toBe(true);
      expect(onAir!.channels[3]).toBe(true);
      expect(onAir!.channels[4]).toBe(true);
      expect(onAir!.channels[5]).toBe(true);
      expect(onAir!.channels[6]).toBe(true);
    });

    it('should handle all channels off-air', () => {
      const header = Buffer.from('Qspt1WmJOL', 'ascii');
      const packet = Buffer.alloc(0x36);
      header.copy(packet);
      packet[0x0a] = 0x06;
      packet[0x20] = 0x03;
      packet[0x21] = 0x21;
      packet.writeUInt16BE(0x0011, 0x22);
      // All channels already 0x00 from buffer.alloc

      const onAir = onAirFromPacket(packet);

      expect(onAir!.channels[1]).toBe(false);
      expect(onAir!.channels[2]).toBe(false);
      expect(onAir!.channels[3]).toBe(false);
      expect(onAir!.channels[4]).toBe(false);
      expect(onAir!.channels[5]).toBe(false);
      expect(onAir!.channels[6]).toBe(false);
    });
  });
});
