import * as ip from 'ip-address';

import {Socket} from 'dgram';
import {NetworkInterfaceInfoIPv4} from 'os';

import {ANNOUNCE_PORT, PROLINK_HEADER} from 'src/constants';
import DeviceManager from 'src/devices';
import {type Logger, noopLogger} from 'src/logger';
import {Device, DeviceID, DeviceType} from 'src/types';
import {buildName, getBroadcastAddress} from 'src/utils';

export const STAGEHAND_STARTUP_INTERVAL = 305;
export const STAGEHAND_KEEP_ALIVE_INTERVAL = 2000;

export enum StagehandStartupStage {
  InitialAnnounce = 0x0a,
  SecondStageClaim = 0x02,
  KeepAlive = 0x06,
}

/**
 * Generates a randomized MAC address with the AlphaTheta OUI (c8:3d:fc).
 */
export function generateStagehandMac(): Uint8Array {
  const mac = new Uint8Array(6);
  mac[0] = 0xc8;
  mac[1] = 0x3d;
  mac[2] = 0xfc;
  mac[3] = Math.floor(Math.random() * 256);
  mac[4] = Math.floor(Math.random() * 256);
  mac[5] = Math.floor(Math.random() * 256);
  return mac;
}

/**
 * Generates a random Stagehand device ID in the observed range of 141 to 211.
 */
export function generateStagehandDeviceId(): number {
  return Math.floor(Math.random() * (211 - 141 + 1)) + 141;
}

/**
 * Constructs a virtual Stagehand Device.
 *
 * @param iface - The network interface to use
 * @param id - The device ID to use (defaults to random Stagehand ID)
 * @param name - The device name (defaults to 'Stagehand')
 * @param macAddr - The optional randomized MAC address
 */
export const getVirtualStagehand = (
  iface: NetworkInterfaceInfoIPv4,
  id: DeviceID = generateStagehandDeviceId(),
  name = 'Stagehand',
  macAddr = generateStagehandMac()
): Device => ({
  id,
  name,
  type: DeviceType.Stagehand,
  ip: new ip.Address4(iface.address),
  macAddr,
});

/**
 * Build Stagehand stage 0x0a packet: Initial announcement.
 * Sent 3 times at 305ms intervals.
 */
export function makeStagehand0aPacket(device: Device): Uint8Array {
  const parts = [
    ...PROLINK_HEADER, // 10 bytes
    ...[0x0a, 0x00], // 2 bytes packet type (0x0a)
    ...buildName(device), // 20 bytes device name
    ...[0x01, 0x03], // 2 bytes protocol / structure bytes
    ...[0x00, 0x25], // 2 bytes packet length (37)
    ...[DeviceType.Stagehand], // 1 byte device type (0x05)
  ];
  return Uint8Array.from(parts);
}

/**
 * Build Stagehand stage 0x02 packet: Second-stage device number claim.
 * Sent 3 times at 305ms intervals with counter N (1, 2, 3).
 */
export function makeStagehand02Packet(
  device: Device,
  mac: Uint8Array,
  counter: number
): Uint8Array {
  const parts = [
    ...PROLINK_HEADER, // 10 bytes
    ...[0x02, 0x00], // 2 bytes packet type (0x02)
    ...buildName(device), // 20 bytes device name
    ...[0x01, 0x03], // 2 bytes protocol / structure bytes
    ...[0x00, 0x32], // 2 bytes packet length (50)
    ...device.ip.toArray(), // 4 bytes IP
    ...mac, // 6 bytes identifier
    ...[0x3a], // 1 byte constant
    ...[counter], // 1 byte counter
    ...[DeviceType.Stagehand], // 1 byte device type (0x05)
    ...[0x01], // 1 byte constant
  ];
  return Uint8Array.from(parts);
}

/**
 * Build Stagehand stage 0x06 packet: Keep-alive.
 * Sent every 2.0s after startup complete.
 */
export function makeStagehand06Packet(device: Device, mac: Uint8Array): Uint8Array {
  const parts = [
    ...PROLINK_HEADER, // 10 bytes
    ...[0x06, 0x00], // 2 bytes packet type (0x06)
    ...buildName(device), // 20 bytes device name
    ...[0x01, 0x03], // 2 bytes protocol / structure bytes
    ...[0x00, 0x36], // 2 bytes packet length (54)
    ...[device.id], // 1 byte device number
    ...[0x01], // 1 byte constant
    ...mac, // 6 bytes identifier
    ...device.ip.toArray(), // 4 bytes IP
    ...[0x01, 0x00, 0x00, 0x00], // 4 bytes constant
    ...[DeviceType.Stagehand], // 1 byte device-type (0x05)
    ...[0x20], // 1 byte trailing byte
  ];
  return Uint8Array.from(parts);
}

export class StagehandAnnouncer {
  #announceSocket: Socket;
  #vcdj: Device;
  #intervalHandle?: NodeJS.Timeout;
  #currentStage: StagehandStartupStage = StagehandStartupStage.InitialAnnounce;
  #stageCounter = 0;
  #iface: NetworkInterfaceInfoIPv4;
  #logger: Logger;
  #onStartupComplete?: () => void;
  #mac: Uint8Array;

  constructor(
    vcdj: Device,
    announceSocket: Socket,
    deviceManager: DeviceManager,
    iface: NetworkInterfaceInfoIPv4,
    logger: Logger = noopLogger
  ) {
    this.#vcdj = vcdj;
    this.#announceSocket = announceSocket;
    this.#iface = iface;
    this.#logger = logger;
    this.#mac = vcdj.macAddr;
  }

  get ready(): Promise<void> {
    if (this.#currentStage === StagehandStartupStage.KeepAlive) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.#onStartupComplete = resolve;
    });
  }

  start() {
    this.#logger.info(
      `Starting Stagehand announcer: device name "${this.#vcdj.name}", ID ${this.#vcdj.id}`
    );
    this.#startStartup();
  }

  #startStartup() {
    this.#currentStage = StagehandStartupStage.InitialAnnounce;
    this.#stageCounter = 0;
    this.#sendStagePackets();
  }

  #sendPacket(packet: Uint8Array) {
    const broadcastAddr = getBroadcastAddress(this.#iface);
    this.#announceSocket.send(packet, ANNOUNCE_PORT, broadcastAddr);
  }

  #sendStagePackets() {
    this.#stageCounter++;

    let packet: Uint8Array;
    switch (this.#currentStage) {
      case StagehandStartupStage.InitialAnnounce:
        packet = makeStagehand0aPacket(this.#vcdj);
        this.#logger.debug(
          `Stagehand sending stage 0x0a (announce) packet ${this.#stageCounter}/3`
        );
        break;
      case StagehandStartupStage.SecondStageClaim:
        packet = makeStagehand02Packet(this.#vcdj, this.#mac, this.#stageCounter);
        this.#logger.debug(
          `Stagehand sending stage 0x02 (claim) packet ${this.#stageCounter}/3`
        );
        break;
      case StagehandStartupStage.KeepAlive:
        this.#logger.info(
          'Stagehand join sequence complete, transitioning to keep-alive'
        );
        this.#startKeepAlive();
        this.#onStartupComplete?.();
        this.#onStartupComplete = undefined;
        return;
    }

    this.#sendPacket(packet);

    if (this.#stageCounter >= 3) {
      this.#advanceStage();
    }

    this.#intervalHandle = setTimeout(
      () => this.#sendStagePackets(),
      STAGEHAND_STARTUP_INTERVAL
    );
  }

  #advanceStage() {
    this.#stageCounter = 0;

    switch (this.#currentStage) {
      case StagehandStartupStage.InitialAnnounce:
        this.#currentStage = StagehandStartupStage.SecondStageClaim;
        break;
      case StagehandStartupStage.SecondStageClaim:
        this.#currentStage = StagehandStartupStage.KeepAlive;
        break;
    }
  }

  #startKeepAlive() {
    if (this.#intervalHandle) {
      clearTimeout(this.#intervalHandle);
      this.#intervalHandle = undefined;
    }

    const sendKeepAlive = () => {
      const packet = makeStagehand06Packet(this.#vcdj, this.#mac);
      this.#logger.debug('Stagehand sending keep-alive packet');
      this.#sendPacket(packet);
    };

    sendKeepAlive();

    this.#intervalHandle = setInterval(sendKeepAlive, STAGEHAND_KEEP_ALIVE_INTERVAL);
  }

  stop() {
    this.#logger.info('Stopping Stagehand announcer');
    if (this.#intervalHandle !== undefined) {
      clearInterval(this.#intervalHandle);
      clearTimeout(this.#intervalHandle);
      this.#intervalHandle = undefined;
    }
  }
}
