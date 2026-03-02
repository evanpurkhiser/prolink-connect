import {describe, expect, it} from 'vitest';

import {Device, DeviceType, MediaSlot} from 'src/types';

import {getPortmapPort, parseWindowsPath, resolveNfsPath} from './index';
import {REKORDBOX_PORTMAP_PORT, STANDARD_PORTMAP_PORT} from './programs';

function createDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 1,
    name: 'CDJ-3000',
    type: DeviceType.CDJ,
    macAddr: new Uint8Array(6),
    ip: {address: '192.168.1.2', parsedAddress: ['192', '168', '1', '2']} as Device['ip'],
    ...overrides,
  };
}

describe('parseWindowsPath', () => {
  it('parses a Windows path with backslashes', () => {
    const result = parseWindowsPath('C:\\Users\\chris\\Music\\track.mp3');
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'Users/chris/Music/track.mp3',
    });
  });

  it('parses a Windows path with forward slashes', () => {
    const result = parseWindowsPath('C:/Users/chris/Music/track.mp3');
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'Users/chris/Music/track.mp3',
    });
  });

  it('uppercases the drive letter', () => {
    const result = parseWindowsPath('d:\\Music\\track.mp3');
    expect(result).toEqual({
      mountPath: '/D/',
      nfsPath: 'Music/track.mp3',
    });
  });

  it('converts all backslashes to forward slashes', () => {
    const result = parseWindowsPath('C:\\Users\\chris\\Music\\PioneerDJ\\Imported from Device\\Contents\\track.mp3');
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'Users/chris/Music/PioneerDJ/Imported from Device/Contents/track.mp3',
    });
  });

  it('returns null for macOS paths', () => {
    expect(parseWindowsPath('/Users/chris/Music/track.mp3')).toBeNull();
  });

  it('returns null for relative paths', () => {
    expect(parseWindowsPath('Music/track.mp3')).toBeNull();
  });
});

describe('resolveNfsPath', () => {
  describe('RB slot (rekordbox link)', () => {
    it('resolves Windows path to NFS mount and path', () => {
      const result = resolveNfsPath(
        MediaSlot.RB,
        'C:/Users/chris/Music/PioneerDJ/track.mp3'
      );
      expect(result).toEqual({
        mountPath: '/C/',
        nfsPath: 'Users/chris/Music/PioneerDJ/track.mp3',
      });
    });

    it('resolves Windows backslash path to NFS mount and path', () => {
      const result = resolveNfsPath(
        MediaSlot.RB,
        'C:\\Users\\chris\\Music\\track.mp3'
      );
      expect(result).toEqual({
        mountPath: '/C/',
        nfsPath: 'Users/chris/Music/track.mp3',
      });
    });

    it('resolves macOS absolute path', () => {
      const result = resolveNfsPath(
        MediaSlot.RB,
        '/Users/chris/Music/track.mp3'
      );
      expect(result).toEqual({
        mountPath: '/',
        nfsPath: 'Users/chris/Music/track.mp3',
      });
    });
  });

  describe('USB slot', () => {
    it('uses /C/ mount for USB slot', () => {
      const result = resolveNfsPath(
        MediaSlot.USB,
        'PIONEER/USBANLZ/track.mp3'
      );
      expect(result).toEqual({
        mountPath: '/C/',
        nfsPath: 'PIONEER/USBANLZ/track.mp3',
      });
    });
  });

  describe('SD slot', () => {
    it('uses /B/ mount for SD slot', () => {
      const result = resolveNfsPath(
        MediaSlot.SD,
        'PIONEER/USBANLZ/track.mp3'
      );
      expect(result).toEqual({
        mountPath: '/B/',
        nfsPath: 'PIONEER/USBANLZ/track.mp3',
      });
    });
  });
});

describe('getPortmapPort', () => {
  it('returns 50111 for rekordbox devices', () => {
    const device = createDevice({
      name: 'rekordbox',
      type: DeviceType.Rekordbox,
    });
    expect(getPortmapPort(device)).toBe(REKORDBOX_PORTMAP_PORT);
    expect(getPortmapPort(device)).toBe(50111);
  });

  it('returns 111 for CDJ devices', () => {
    const device = createDevice({
      name: 'CDJ-3000',
      type: DeviceType.CDJ,
    });
    expect(getPortmapPort(device)).toBe(STANDARD_PORTMAP_PORT);
    expect(getPortmapPort(device)).toBe(111);
  });

  it('returns 111 for mixer devices', () => {
    const device = createDevice({
      name: 'DJM-900NXS2',
      type: DeviceType.Mixer,
    });
    expect(getPortmapPort(device)).toBe(STANDARD_PORTMAP_PORT);
  });
});

describe('portmap port constants', () => {
  it('standard portmap port is 111', () => {
    expect(STANDARD_PORTMAP_PORT).toBe(111);
  });

  it('rekordbox portmap port is 50111', () => {
    expect(REKORDBOX_PORTMAP_PORT).toBe(50111);
  });
});
