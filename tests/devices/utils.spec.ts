import {PROLINK_HEADER} from 'src/constants';
import {deviceFromPacket} from 'src/devices/utils';
import {DeviceType} from 'src/types';
import {readMock} from 'tests/utils';

describe('deviceFromPacket', () => {
  it('fails with error for non-prolink packet', () => {
    const packet = Buffer.from([]);

    expect(() => deviceFromPacket(packet)).toThrow();
  });

  it('only handles announce (0x06) packets', () => {
    const packet = Buffer.from([...PROLINK_HEADER, 0x05]);

    expect(deviceFromPacket(packet)).toBeNull();
  });

  it('handles a real announce packet', async () => {
    const packet = await readMock('announce-cdj-2.dat');

    const expected = {
      id: 2,
      type: DeviceType.CDJ,
      name: 'CDJ-2000nexus',
      ip: expect.objectContaining({address: '10.0.0.207'}),
      macAddr: new Uint8Array([116, 94, 28, 87, 130, 216]),
    };

    expect(deviceFromPacket(packet)).toEqual(expected);
  });
});
