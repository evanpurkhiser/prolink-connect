import {PROLINK_HEADER} from 'src/constants';
import {positionFromPacket} from 'src/status/utils';

describe('positionFromPacket', () => {
  test('returns undefined for non-prolink packet', () => {
    const packet = Buffer.from([]);
    expect(positionFromPacket(packet)).toBeUndefined();
  });

  test('returns undefined for packet with wrong subtype', () => {
    const packet = Buffer.from([
      ...PROLINK_HEADER,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x02, // Wrong subtype at 0x20
    ]);
    expect(positionFromPacket(packet)).toBeUndefined();
  });

  test('returns undefined for packet that is too short', () => {
    const packet = Buffer.from([
      ...PROLINK_HEADER,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00, // Subtype 0x00 at 0x20
      0x03, // Device ID
      0x00,
      0x05, // lenr too small
    ]);
    expect(positionFromPacket(packet)).toBeUndefined();
  });

  test('parses a valid position packet from CDJ-3000', () => {
    const packet = Buffer.alloc(0x40);

    // Write header
    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));

    // Write fields
    packet[0x20] = 0x00; // Subtype
    packet[0x21] = 0x03; // Device ID = 3
    packet.writeUInt16BE(0x0038, 0x22); // lenr

    packet.writeUInt32BE(180, 0x24); // Track length = 180 seconds (3:00)
    packet.writeUInt32BE(45500, 0x28); // Playhead = 45.5 seconds
    packet.writeInt32BE(326 * 64, 0x2c); // Pitch = 3.26% (326 * 64)
    packet.writeUInt32BE(1202, 0x30); // BPM = 120.2 (1202 / 10)

    const position = positionFromPacket(packet);

    expect(position).toEqual({
      deviceId: 3,
      trackLength: 180,
      playhead: 45500,
      pitch: 3.26,
      bpm: 120.2,
    });
  });

  test('handles unknown BPM (0xffffffff)', () => {
    const packet = Buffer.alloc(0x40);

    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));

    packet[0x20] = 0x00;
    packet[0x21] = 0x02;
    packet.writeUInt16BE(0x0038, 0x22);
    packet.writeUInt32BE(200, 0x24);
    packet.writeUInt32BE(10000, 0x28);
    packet.writeInt32BE(0, 0x2c);
    packet.writeUInt32BE(0xffffffff, 0x30); // Unknown BPM

    const position = positionFromPacket(packet);

    expect(position?.bpm).toBeNull();
  });

  test('handles negative pitch values', () => {
    const packet = Buffer.alloc(0x40);

    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));

    packet[0x20] = 0x00;
    packet[0x21] = 0x01;
    packet.writeUInt16BE(0x0038, 0x22);
    packet.writeUInt32BE(240, 0x24);
    packet.writeUInt32BE(60000, 0x28);
    packet.writeInt32BE(-200 * 64, 0x2c); // Pitch = -2.0% (-200 * 64)
    packet.writeUInt32BE(1180, 0x30); // BPM = 118.0

    const position = positionFromPacket(packet);

    expect(position?.pitch).toBe(-2.0);
  });

  test('handles track at start (playhead = 0)', () => {
    const packet = Buffer.alloc(0x40);

    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));

    packet[0x20] = 0x00;
    packet[0x21] = 0x04;
    packet.writeUInt16BE(0x0038, 0x22);
    packet.writeUInt32BE(300, 0x24);
    packet.writeUInt32BE(0, 0x28); // Playhead at start
    packet.writeInt32BE(0, 0x2c);
    packet.writeUInt32BE(1280, 0x30);

    const position = positionFromPacket(packet);

    expect(position).toBeDefined();
    expect(position?.playhead).toBe(0);
  });
});
