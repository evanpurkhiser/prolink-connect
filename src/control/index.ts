import {Socket} from 'dgram';

import {BEAT_PORT, PROLINK_HEADER} from 'src/constants';
import {CDJStatus, Device} from 'src/types';
import {buildName} from 'src/utils';
import {udpSend} from 'src/utils/udp';

interface Options {
  hostDevice: Device;
  device: Device;
  playState: CDJStatus.PlayState.Cued | CDJStatus.PlayState.Playing;
}

const STATE_MAP = {
  [CDJStatus.PlayState.Cued]: 0x01,
  [CDJStatus.PlayState.Playing]: 0x00,
};

/**
 * Generates the packet used to control the playstate of CDJs
 */
export const makePlaystatePacket = ({hostDevice, device, playState}: Options) =>
  Uint8Array.from([
    ...PROLINK_HEADER,
    ...[0x02],
    ...buildName(hostDevice),
    ...[0x01, 0x00],
    ...[hostDevice.id],
    ...[0x00, 0x04],
    ...new Array(4)
      .fill(0x00)
      .map((_, i) => (i === device.id ? STATE_MAP[playState] : 0)),
  ]);

export default class Control {
  #hostDevice: Device;
  /**
   * The socket used to send control packets
   */
  #beatSocket: Socket;

  constructor(beatSocket: Socket, hostDevice: Device) {
    this.#beatSocket = beatSocket;
    this.#hostDevice = hostDevice;
  }

  /**
   * Start or stop a CDJ on the network
   */
  async setPlayState(device: Device, playState: Options['playState']) {
    const packet = makePlaystatePacket({hostDevice: this.#hostDevice, device, playState});
    await udpSend(this.#beatSocket, packet, BEAT_PORT, device.ip.address);
  }
}
