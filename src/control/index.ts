import {Socket} from 'dgram';

import {BEAT_PORT, PROLINK_HEADER, STATUS_PORT} from 'src/constants';
import {CDJStatus, Device, DeviceType} from 'src/types';
import {buildName} from 'src/utils';
import {udpSend} from 'src/utils/udp';

import {makeStagehandPrefWritePacket, makeStagehandTransportPacket} from './stagehand';

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
 * Generates the packet used to control the playstate of CDJs in active connection mode
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
  /**
   * Randomized correlation byte per session for Stagehand commands
   */
  #correlationByte: number;

  constructor(beatSocket: Socket, hostDevice: Device) {
    this.#beatSocket = beatSocket;
    this.#hostDevice = hostDevice;
    this.#correlationByte = Math.floor(Math.random() * 256);
  }

  /**
   * Start or stop a CDJ on the network.
   * Delegates automatically to Stagehand-specific transport control if connected in Stagehand mode.
   */
  async setPlayState(device: Device, playState: Options['playState']) {
    if (this.#hostDevice.type === DeviceType.Stagehand) {
      if (playState === CDJStatus.PlayState.Playing) {
        await this.play(device);
      } else {
        await this.pause(device);
      }
      return;
    }

    const packet = makePlaystatePacket({hostDevice: this.#hostDevice, device, playState});
    await udpSend(this.#beatSocket, packet, BEAT_PORT, device.ip.address);
  }

  /**
   * Send Stagehand PLAY command (paired 0x0f and 0x14 packets)
   */
  async play(device: Device) {
    const p1 = makeStagehandTransportPacket(
      this.#hostDevice,
      0x0f,
      true,
      this.#correlationByte
    );
    const p2 = makeStagehandTransportPacket(
      this.#hostDevice,
      0x14,
      true,
      this.#correlationByte
    );
    await udpSend(this.#beatSocket, p1, BEAT_PORT, device.ip.address);
    await udpSend(this.#beatSocket, p2, BEAT_PORT, device.ip.address);
  }

  /**
   * Send Stagehand PAUSE command (paired 0x14 packet)
   */
  async pause(device: Device) {
    const p = makeStagehandTransportPacket(
      this.#hostDevice,
      0x14,
      false,
      this.#correlationByte
    );
    await udpSend(this.#beatSocket, p, BEAT_PORT, device.ip.address);
  }

  /**
   * Send Stagehand SEEK forward command
   * @param press - true to start seek, false to release
   */
  async seekForward(device: Device, press: boolean) {
    const p = makeStagehandTransportPacket(
      this.#hostDevice,
      0x1a,
      press,
      this.#correlationByte
    );
    await udpSend(this.#beatSocket, p, BEAT_PORT, device.ip.address);
  }

  /**
   * Send Stagehand SEEK backward command
   * @param press - true to start seek, false to release
   */
  async seekBackward(device: Device, press: boolean) {
    const p = makeStagehandTransportPacket(
      this.#hostDevice,
      0x1b,
      press,
      this.#correlationByte
    );
    await udpSend(this.#beatSocket, p, BEAT_PORT, device.ip.address);
  }

  /**
   * Send Stagehand SKIP track command
   * @param press - true to start skip, false to release
   */
  async skip(device: Device, press: boolean) {
    const p = makeStagehandTransportPacket(
      this.#hostDevice,
      0x18,
      press,
      this.#correlationByte
    );
    await udpSend(this.#beatSocket, p, BEAT_PORT, device.ip.address);
  }

  /**
   * Send Stagehand preference write command (0x6b packet) to port 50002
   */
  async setPreference(
    device: Device,
    options: {onAir?: 'on' | 'off'; quantize?: number}
  ) {
    const p = makeStagehandPrefWritePacket(this.#hostDevice, options);
    await udpSend(this.#beatSocket, p, STATUS_PORT, device.ip.address);
  }
}
