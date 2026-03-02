import {MediaSlot} from 'src/types';
import {parseWindowsPath, resolveNfsPath} from 'src/nfs';

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

  it('normalizes drive letter to uppercase', () => {
    const result = parseWindowsPath('d:\\Music\\track.mp3');
    expect(result).toEqual({
      mountPath: '/D/',
      nfsPath: 'Music/track.mp3',
    });
  });

  it('handles mixed separators', () => {
    const result = parseWindowsPath('C:\\Users/chris\\Music/track.mp3');
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'Users/chris/Music/track.mp3',
    });
  });

  it('returns null for a non-Windows path', () => {
    expect(parseWindowsPath('/PIONEER/USBANLZ/track.mp3')).toBeNull();
  });

  it('returns null for a relative path', () => {
    expect(parseWindowsPath('Music/track.mp3')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseWindowsPath('')).toBeNull();
  });

  it('handles a file directly in the drive root', () => {
    const result = parseWindowsPath('C:\\track.mp3');
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'track.mp3',
    });
  });
});

describe('resolveNfsPath', () => {
  it('returns static mount path for USB slot', () => {
    const result = resolveNfsPath(MediaSlot.USB, 'PIONEER/USBANLZ/track.mp3');
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'PIONEER/USBANLZ/track.mp3',
    });
  });

  it('returns static mount path for SD slot', () => {
    const result = resolveNfsPath(MediaSlot.SD, 'PIONEER/USBANLZ/track.mp3');
    expect(result).toEqual({
      mountPath: '/B/',
      nfsPath: 'PIONEER/USBANLZ/track.mp3',
    });
  });

  it('extracts mount path from Windows file path for RB slot', () => {
    const result = resolveNfsPath(
      MediaSlot.RB,
      'C:\\Users\\chris\\Music\\track.mp3'
    );
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'Users/chris/Music/track.mp3',
    });
  });

  it('handles RB slot with forward-slash Windows path', () => {
    const result = resolveNfsPath(
      MediaSlot.RB,
      'D:/Music/rekordbox/track.wav'
    );
    expect(result).toEqual({
      mountPath: '/D/',
      nfsPath: 'Music/rekordbox/track.wav',
    });
  });

  it('extracts mount path from macOS file path for RB slot', () => {
    const result = resolveNfsPath(
      MediaSlot.RB,
      '/Users/chris/Music/track.mp3'
    );
    expect(result).toEqual({
      mountPath: '/',
      nfsPath: 'Users/chris/Music/track.mp3',
    });
  });

  it('does not apply Windows parsing to USB slot paths', () => {
    // A USB path that happens to start with a letter should NOT be parsed as Windows
    const result = resolveNfsPath(MediaSlot.USB, 'C:\\fake\\path.mp3');
    expect(result).toEqual({
      mountPath: '/C/',
      nfsPath: 'C:\\fake\\path.mp3',
    });
  });
});
