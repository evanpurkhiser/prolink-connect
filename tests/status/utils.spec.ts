import {PROLINK_HEADER} from 'src/constants';
import {PlayState} from 'src/status/types';
import {mediaSlotFromPacket, statusFromPacket} from 'src/status/utils';
import {MediaColor, MediaSlot, TrackType} from 'src/types';
import {readMock} from 'tests/utils';

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
