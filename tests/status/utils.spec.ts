import {readMock} from 'tests/utils';

import {PROLINK_HEADER} from 'src/constants';
import {PlayState} from 'src/status/types';
import {
  mediaSlotFromPacket,
  mixerStateFromPacket,
  statusFromPacket,
  vuFromPacket,
} from 'src/status/utils';
import {MediaColor, MediaSlot, TrackType} from 'src/types';

describe('statusFromPacket', () => {
  it('fails with error for non-prolink packet', () => {
    const packet = Buffer.from([]);

    expect(() => statusFromPacket(packet)).toThrow();
  });

  it('only handles announce packets which are large enough', () => {
    const packet = Buffer.from([...PROLINK_HEADER, 0x00, 0x00]);

    expect(statusFromPacket(packet)).toBeUndefined();
  });

  it('handles a real announce packet', async () => {
    const packet = await readMock('status-simple.dat');

    const status = statusFromPacket(packet);

    expect(status).toEqual({
      packetNum: 74108,
      deviceId: 3,
      beat: null,
      beatInMeasure: 0,
      beatsUntilCue: null,
      effectivePitch: 0,
      isMaster: false,
      isOnAir: false,
      isSync: false,
      isEmergencyMode: false,
      playState: PlayState.Empty,
      sliderPitch: 0,
      trackBPM: null,
      trackDeviceId: 0,
      trackId: 0,
      trackSlot: MediaSlot.Empty,
      trackType: TrackType.None,
    });
  });
});

describe('mediaSlotFromPacket', () => {
  it('fails with error for non-prolink packet', () => {
    const packet = Buffer.from([]);

    expect(() => mediaSlotFromPacket(packet)).toThrow();
  });

  it('only handles media slot packet types', () => {
    const packet = Buffer.from([...PROLINK_HEADER, 0x05]);

    expect(mediaSlotFromPacket(packet)).toBeUndefined();
  });

  it('handles a real media slot packet', async () => {
    const packet = await readMock('media-slot-usb.dat');

    const status = mediaSlotFromPacket(packet);

    expect(status).toEqual({
      color: MediaColor.Default,
      slot: MediaSlot.USB,
      name: '',
      deviceId: 2,
      createdDate: new Date('2020-10-10T00:00:00.000Z'),
      playlistCount: 1,
      trackCount: 76,
      tracksType: 1,
      hasSettings: true,
      totalBytes: BigInt('62714675200'),
      freeBytes: BigInt('61048520704'),
    });
  });
});

describe('mixerStateFromPacket', () => {
  it('returns undefined for non-prolink packet', () => {
    const packet = Buffer.from([]);
    expect(mixerStateFromPacket(packet)).toBeUndefined();
  });

  it('returns undefined for wrong packet type', () => {
    const packet = Buffer.alloc(266);
    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));
    packet[10] = 0x0a; // wrong type
    expect(mixerStateFromPacket(packet)).toBeUndefined();
  });

  it('returns undefined for packet that is too short', () => {
    const packet = Buffer.alloc(100);
    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));
    packet[10] = 0x39;
    expect(mixerStateFromPacket(packet)).toBeUndefined();
  });

  it('correctly parses a valid 0x39 mixer state packet', () => {
    const packet = Buffer.alloc(266);
    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));
    packet[10] = 0x39;

    // Device name "DJM-A9"
    packet.write('DJM-A9', 11, 'ascii');

    // Crossfader position
    packet[180] = 120;

    // Fill channel blocks
    for (let ch = 1; ch <= 4; ch++) {
      const offset = 36 + (ch - 1) * 24;
      packet[offset + 1] = 100 + ch; // trim
      packet[offset + 3] = 110 + ch; // eqHi
      packet[offset + 4] = 120 + ch; // eqMid
      packet[offset + 6] = 130 + ch; // eqLow
      packet[offset + 7] = 140 + ch; // colorFx
      packet[offset + 11] = 150 + ch; // fader
      packet[offset + 12] = ch === 1 ? 0x01 : ch === 2 ? 0x02 : 0x00; // crossfader assign: CH1=A, CH2=B, others=thru
    }

    const state = mixerStateFromPacket(packet);
    expect(state).toEqual({
      deviceId: 33,
      deviceName: 'DJM-A9',
      crossfader: 120,
      channels: {
        1: {
          trim: 101,
          eqHi: 111,
          eqMid: 121,
          eqLow: 131,
          colorFx: 141,
          fader: 151,
          crossfaderAssign: 'A',
        },
        2: {
          trim: 102,
          eqHi: 112,
          eqMid: 122,
          eqLow: 132,
          colorFx: 142,
          fader: 152,
          crossfaderAssign: 'B',
        },
        3: {
          trim: 103,
          eqHi: 113,
          eqMid: 123,
          eqLow: 133,
          colorFx: 143,
          fader: 153,
          crossfaderAssign: 'thru',
        },
        4: {
          trim: 104,
          eqHi: 114,
          eqMid: 124,
          eqLow: 134,
          colorFx: 144,
          fader: 154,
          crossfaderAssign: 'thru',
        },
      },
    });
  });
});

describe('vuFromPacket', () => {
  it('returns undefined for non-prolink packet', () => {
    const packet = Buffer.from([]);
    expect(vuFromPacket(packet)).toBeUndefined();
  });

  it('returns undefined for wrong packet type', () => {
    const packet = Buffer.alloc(584);
    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));
    packet[10] = 0x0a; // wrong type
    expect(vuFromPacket(packet)).toBeUndefined();
  });

  it('returns undefined for packet that is too short', () => {
    const packet = Buffer.alloc(300);
    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));
    packet[10] = 0x58;
    expect(vuFromPacket(packet)).toBeUndefined();
  });

  it('correctly parses a valid 0x58 VU level packet', () => {
    const packet = Buffer.alloc(584);
    PROLINK_HEADER.forEach((byte, i) => (packet[i] = byte));
    packet[10] = 0x58;

    // Fill VU samples starting at offset 44
    for (let ch = 1; ch <= 4; ch++) {
      const chOffset = 44 + (ch - 1) * 60;
      for (let i = 0; i < 15; i++) {
        const frameOffset = chOffset + i * 4;
        packet.writeUInt16BE(1000 * ch + i, frameOffset); // left
        packet.writeUInt16BE(2000 * ch + i, frameOffset + 2); // right
      }
    }

    const state = vuFromPacket(packet);
    expect(state).toBeDefined();
    expect(state!.deviceId).toBe(33);
    expect(state!.channels[1][0]).toEqual({left: 1000, right: 2000});
    expect(state!.channels[1][14]).toEqual({left: 1014, right: 2014});
    expect(state!.channels[4][0]).toEqual({left: 4000, right: 8000});
    expect(state!.channels[4][14]).toEqual({left: 4014, right: 8014});
  });
});
