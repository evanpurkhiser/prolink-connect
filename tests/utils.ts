/* istanbul ignore file */

import * as ip from 'ip-address';
import {readFile} from 'fs/promises';
import {Device, DeviceType} from 'src/types';

export function readMock(path: string) {
  return readFile(`${__dirname}/_data/${path}`);
}

export function mockDevice(extra?: Partial<Device>): Device {
  return {
    id: 1,
    type: DeviceType.CDJ,
    name: 'CDJ-test',
    ip: new ip.Address4('10.0.0.1'),
    macAddr: Uint8Array.of(0x01, 0x02, 0x03, 0x04, 0x05, 0x06),
    ...extra,
  };
}
