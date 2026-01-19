import * as ip from 'ip-address';
import each from 'jest-each';

import {MediaSlot, TrackType} from 'src/types';
import {bpmToSeconds, buildName, getSlotName, getTrackTypeName} from 'src/utils';

describe('bpmToSeconds', () => {
  each([
    [60, 0, 1],
    [120, 0, 0.5],
    [60, 25, 0.8],
  ]).it(
    'computes [%d bpm at %d pitch] as %d second per beat',
    (bpm, pitch, secondsPerBeat) => {
      expect(bpmToSeconds(bpm, pitch)).toEqual(secondsPerBeat);
    }
  );
});

describe('buildName', () => {
  it('should build a 20-byte name buffer from device', () => {
    const device = {
      id: 1,
      name: 'CDJ-3000',
      type: 1,
      ip: new ip.Address4('192.168.1.1'),
      macAddr: new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]),
    };

    const result = buildName(device);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(20);
    expect(Buffer.from(result).toString('ascii').startsWith('CDJ-3000')).toBe(true);
  });

  it('should pad short names with zeros', () => {
    const device = {
      id: 1,
      name: 'XDJ',
      type: 1,
      ip: new ip.Address4('192.168.1.1'),
      macAddr: new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]),
    };

    const result = buildName(device);

    expect(result.length).toBe(20);
    expect(result[3]).toBe(0); // Padding starts after 'XDJ'
  });
});

describe('getSlotName', () => {
  it('should return slot name for USB', () => {
    expect(getSlotName(MediaSlot.USB)).toBe('usb');
  });

  it('should return slot name for SD', () => {
    expect(getSlotName(MediaSlot.SD)).toBe('sd');
  });

  it('should return slot name for RB', () => {
    expect(getSlotName(MediaSlot.RB)).toBe('rb');
  });
});

describe('getTrackTypeName', () => {
  it('should return track type name for RB', () => {
    expect(getTrackTypeName(TrackType.RB)).toBe('rb');
  });

  it('should return track type name for Unanalyzed', () => {
    expect(getTrackTypeName(TrackType.Unanalyzed)).toBe('unanalyzed');
  });

  it('should return track type name for AudioCD', () => {
    expect(getTrackTypeName(TrackType.AudioCD)).toBe('audiocd');
  });
});
