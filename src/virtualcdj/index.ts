import * as ip from 'ip-address';

import {Socket} from 'dgram';
import {NetworkInterfaceInfoIPv4} from 'os';

import {
  ANNOUNCE_INTERVAL,
  ANNOUNCE_PORT,
  PROLINK_HEADER,
  STARTUP_STAGE_INTERVAL,
  VIRTUAL_CDJ_FIRMWARE,
  VIRTUAL_CDJ_NAME,
} from 'src/constants';
import DeviceManager from 'src/devices';
import {Device, DeviceID, DeviceType} from 'src/types';
import {buildName} from 'src/utils';

/**
 * Constructs a virtual CDJ Device.
 *
 * @param iface - The network interface to use
 * @param id - The device ID to use
 * @param name - Optional custom name (defaults to VIRTUAL_CDJ_NAME constant)
 */
export const getVirtualCDJ = (
  iface: NetworkInterfaceInfoIPv4,
  id: DeviceID,
  name: string = VIRTUAL_CDJ_NAME
): Device => ({
  id,
  name,
  type: DeviceType.CDJ,
  ip: new ip.Address4(iface.address),
  macAddr: new Uint8Array(iface.mac.split(':').map(s => parseInt(s, 16))),
});

/**
 * Returns a mostly empty-state status packet. This is currently used to report
 * the virtual CDJs status, which *seems* to be required for the CDJ to send
 * metadata about some unanalyzed mp3 files.
 */
export function makeStatusPacket(device: Device): Uint8Array {
  // NOTE: It seems that byte 0x68 and 0x75 MUST be 1 in order for the CDJ to
  //       correctly report mp3 metadata (again, only for some files).
  //       See https://github.com/brunchboy/dysentery/issues/15
  // NOTE: Byte 0xb6 MUST be 1 in order for the CDJ to not think that our
  //       device is "running an older firmware"
  //
  // prettier-ignore
  const b = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x03, 0x00, 0x00, 0xf8, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x9c, 0xff, 0xfe, 0x00, 0x10, 0x00, 0x00,
    0x7f, 0xff, 0xff, 0xff, 0x7f, 0xff, 0xff, 0xff, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
    0xff, 0xff, 0xff, 0xff, 0x01, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  // The following items get replaced in this format:
  //
  //  - 0x00: 10 byte header
  //  - 0x0B: 20 byte device name
  //  - 0x21: 01 byte device ID
  //  - 0x24: 01 byte device ID
  //  - 0x7C: 04 byte firmware string

  b.set(PROLINK_HEADER, 0x0b);
  b.set(Buffer.from(device.name, 'ascii'), 0x0b);
  b.set(new Uint8Array([device.id]), 0x21);
  b.set(new Uint8Array([device.id]), 0x24);
  b.set(Buffer.from(VIRTUAL_CDJ_FIRMWARE, 'ascii'), 0x7c);

  return b;
}

/**
 * constructs the announce packet that is sent on the prolink network to
 * announce a devices existence.
 */
export function makeAnnouncePacket(deviceToAnnounce: Device): Uint8Array {
  const d = deviceToAnnounce;

  // unknown padding bytes
  const unknown1 = [0x01, 0x02];
  // Updated on 2024-04-27 to be compatible with CDJ-3000 players that use player number 5 or 6.
  const unknown2 = [0x02, 0x00, 0x00, 0x00];

  // The packet below is constructed in the following format:
  //
  //  - 0x00: 10 byte header
  //  - 0x0A: 02 byte announce packet type
  //  - 0x0c: 20 byte device name
  //  - 0x20: 02 byte unknown
  //  - 0x22: 02 byte packet length
  //  - 0x24: 01 byte for the player ID
  //  - 0x25: 01 byte for the player type
  //  - 0x26: 06 byte mac address
  //  - 0x2C: 04 byte IP address
  //  - 0x30: 04 byte unknown
  //  - 0x34: 01 byte for the player type
  //  - 0x35: 01 byte final padding

  const parts = [
    ...PROLINK_HEADER,
    ...[0x06, 0x00],
    ...buildName(d),
    ...unknown1,
    ...[0x00, 0x36],
    ...[d.id],
    ...[d.type],
    ...d.macAddr,
    ...d.ip.toArray(),
    ...unknown2,
    ...[d.type],
    // Updated on 2024-04-27 to be compatible with CDJ-3000 players that use player number 5 or 6.
    ...[0x64],
  ];

  return Uint8Array.from(parts);
}

/**
 * Startup stages for the full startup protocol.
 */
enum StartupStage {
  /** Initial announcement packets (0x0a) */
  InitialAnnounce = 0x0a,
  /** First-stage device number claim (0x00) */
  FirstStageClaim = 0x00,
  /** Second-stage device number claim (0x02) */
  SecondStageClaim = 0x02,
  /** Final-stage device number claim (0x04) */
  FinalStageClaim = 0x04,
  /** Keep-alive packets (0x06) */
  KeepAlive = 0x06,
}

/**
 * Build stage 0x0a packet: Initial announcement (CDJ-3000 compatible).
 * Sent 3 times at 300ms intervals.
 */
function makeStage0aPacket(device: Device): Uint8Array {
  const isHighPlayerNumber = device.id >= 5;
  const parts = [
    ...PROLINK_HEADER,
    ...[0x0a, 0x00],
    ...buildName(device),
    ...[0x01],
    ...[isHighPlayerNumber ? 0x04 : 0x02],
    ...[0x00, isHighPlayerNumber ? 0x26 : 0x25],
    ...[0x01],
  ];

  if (isHighPlayerNumber) {
    parts.push(0x40);
  }

  return Uint8Array.from(parts);
}

/**
 * Build stage 0x00 packet: First-stage device number claim (CDJ-3000 compatible).
 * Sent 3 times at 300ms intervals with counter N (1, 2, 3).
 */
function makeStage00Packet(device: Device, counter: number): Uint8Array {
  const isHighPlayerNumber = device.id >= 5;
  const parts = [
    ...PROLINK_HEADER,
    ...[0x00, 0x00],
    ...buildName(device),
    ...[0x01],
    ...[isHighPlayerNumber ? 0x03 : 0x02],
    ...[0x00, 0x2c],
    ...[counter],
    ...[0x01],
    ...device.macAddr,
  ];

  return Uint8Array.from(parts);
}

/**
 * Build stage 0x02 packet: Second-stage device number claim (CDJ-3000 compatible).
 * Sent 3 times at 300ms intervals with counter N (1, 2, 3).
 */
function makeStage02Packet(device: Device, counter: number): Uint8Array {
  const isHighPlayerNumber = device.id >= 5;
  const parts = [
    ...PROLINK_HEADER,
    ...[0x02, 0x00],
    ...buildName(device),
    ...[0x01],
    ...[isHighPlayerNumber ? 0x03 : 0x02],
    ...[0x00, 0x32],
    ...device.ip.toArray(),
    ...device.macAddr,
    ...[device.id],
    ...[counter],
    ...[0x30, 0x01, 0x01], // auto-assign mode
  ];

  return Uint8Array.from(parts);
}

/**
 * Build stage 0x04 packet: Final-stage device number claim (CDJ-3000 compatible).
 * Sent 1-3 times at 300ms intervals with counter N.
 */
function makeStage04Packet(device: Device, counter: number): Uint8Array {
  const isHighPlayerNumber = device.id >= 5;
  const parts = [
    ...PROLINK_HEADER,
    ...[0x04, 0x00],
    ...buildName(device),
    ...[0x01],
    ...[isHighPlayerNumber ? 0x03 : 0x02],
    ...[0x00, 0x26],
    ...[device.id],
    ...[counter],
  ];

  return Uint8Array.from(parts);
}

/**
 * Build stage 0x06 packet: Keep-alive (CDJ-3000 compatible).
 * Sent every 1.5s after startup complete.
 */
function makeStage06Packet(device: Device, peerCount: number): Uint8Array {
  const isHighPlayerNumber = device.id >= 5;
  const parts = [
    ...PROLINK_HEADER,
    ...[0x06, 0x00],
    ...buildName(device),
    ...[0x01, 0x02],
    ...[0x00, 0x36],
    ...[device.id],
    ...[0x01],
    ...device.macAddr,
    ...device.ip.toArray(),
    ...[0x30],
    ...[peerCount],
    ...[0x00, 0x00, 0x00, 0x01],
    ...[isHighPlayerNumber ? 0x64 : 0x00],
  ];

  return Uint8Array.from(parts);
}

/**
 * Check if a packet is a channel conflict (0x08) packet.
 * Returns the conflicting device ID if this is a conflict packet, null otherwise.
 */
function parseConflictPacket(packet: Buffer): number | null {
  // Conflict packets are 0x29 (41) bytes long with packet type 0x08 at byte 0x0a
  if (packet.length !== 0x29) {
    return null;
  }

  // Check for PROLINK_HEADER
  if (!packet.subarray(0, 10).equals(Buffer.from(PROLINK_HEADER))) {
    return null;
  }

  // Check packet type byte (0x0a)
  if (packet[0x0a] !== 0x08) {
    return null;
  }

  // Extract the device ID being defended (byte 0x24)
  return packet[0x24];
}

/**
 * the announcer service is used to report our fake CDJ to the prolink network,
 * as if it was a real CDJ.
 */
export class Announcer {
  /**
   * The announce socket to use to make the announcements
   */
  #announceSocket: Socket;
  /**
   * The device manager service used to determine which devices to announce
   * ourselves to.
   */
  #deviceManager: DeviceManager;
  /**
   * The virtual CDJ device to announce
   */
  #vcdj: Device;
  /**
   * The interval handle used to stop announcing
   */
  #intervalHandle?: NodeJS.Timeout;
  /**
   * Whether to use full startup protocol
   */
  #fullStartup: boolean;
  /**
   * Current startup stage (only used when fullStartup is enabled)
   */
  #currentStage: StartupStage = StartupStage.InitialAnnounce;
  /**
   * Packet counter within current stage (1, 2, 3)
   */
  #stageCounter = 0;
  /**
   * Listener for incoming conflict packets
   */
  #conflictListener?: (msg: Buffer) => void;
  /**
   * Network interface for the virtual CDJ
   */
  #iface: NetworkInterfaceInfoIPv4;

  constructor(
    vcdj: Device,
    announceSocket: Socket,
    deviceManager: DeviceManager,
    iface: NetworkInterfaceInfoIPv4,
    fullStartup = false
  ) {
    this.#vcdj = vcdj;
    this.#announceSocket = announceSocket;
    this.#deviceManager = deviceManager;
    this.#iface = iface;
    this.#fullStartup = fullStartup;
  }

  start() {
    if (this.#fullStartup) {
      this.#startFullStartup();
    } else {
      this.#startKeepAlive();
    }
  }

  /**
   * Start the full startup protocol with stage progression.
   */
  #startFullStartup() {
    this.#currentStage = StartupStage.InitialAnnounce;
    this.#stageCounter = 0;

    // Set up conflict detection listener
    this.#conflictListener = (msg: Buffer) => {
      const conflictDeviceId = parseConflictPacket(msg);
      if (conflictDeviceId === this.#vcdj.id) {
        console.warn(
          `Device ID ${this.#vcdj.id} is already in use. Finding alternative...`
        );
        this.#handleConflict();
      }
    };
    this.#announceSocket.on('message', this.#conflictListener);

    this.#sendStagePackets();
  }

  /**
   * Handle a device ID conflict by finding an available ID and restarting.
   */
  #handleConflict() {
    // Stop current startup
    if (this.#intervalHandle) {
      clearTimeout(this.#intervalHandle);
      this.#intervalHandle = undefined;
    }

    // Find an available device ID
    const usedIds = new Set([...this.#deviceManager.devices.values()].map(d => d.id));
    let newId: number | null = null;

    // Try IDs from 7-32 first (recommended range), then 1-6 if needed
    for (let id = 7; id <= 32; id++) {
      if (!usedIds.has(id)) {
        newId = id;
        break;
      }
    }
    if (newId === null) {
      for (let id = 1; id <= 6; id++) {
        if (!usedIds.has(id)) {
          newId = id;
          break;
        }
      }
    }

    if (newId === null) {
      console.error('No available device IDs. All 32 slots are occupied.');
      this.stop();
      return;
    }

    console.log(`Switching to device ID ${newId}`);

    // Update virtual CDJ with new ID
    this.#vcdj = getVirtualCDJ(this.#iface, newId as DeviceID);

    // Restart startup sequence
    this.#currentStage = StartupStage.InitialAnnounce;
    this.#stageCounter = 0;
    this.#sendStagePackets();
  }

  /**
   * Send packets for the current startup stage and progress to next stage.
   */
  #sendStagePackets() {
    this.#stageCounter++;

    // Build packet for current stage
    let packet: Uint8Array;
    switch (this.#currentStage) {
      case StartupStage.InitialAnnounce:
        packet = makeStage0aPacket(this.#vcdj);
        break;
      case StartupStage.FirstStageClaim:
        packet = makeStage00Packet(this.#vcdj, this.#stageCounter);
        break;
      case StartupStage.SecondStageClaim:
        packet = makeStage02Packet(this.#vcdj, this.#stageCounter);
        break;
      case StartupStage.FinalStageClaim:
        packet = makeStage04Packet(this.#vcdj, this.#stageCounter);
        break;
      case StartupStage.KeepAlive:
        // Transition to keep-alive mode
        this.#startKeepAlive();
        return;
    }

    // Broadcast packet to all known devices
    const devices = [...this.#deviceManager.devices.values()];
    devices.forEach(device =>
      this.#announceSocket.send(packet, ANNOUNCE_PORT, device.ip.address)
    );

    // Also broadcast to network if no devices yet
    if (devices.length === 0) {
      const broadcastAddr = this.#vcdj.ip.endAddress().address;
      this.#announceSocket.send(packet, ANNOUNCE_PORT, broadcastAddr);
    }

    // Progress to next packet or stage
    if (this.#stageCounter >= 3) {
      // Move to next stage
      this.#advanceStage();
    }

    // Schedule next packet (300ms for startup stages)
    this.#intervalHandle = setTimeout(
      () => this.#sendStagePackets(),
      STARTUP_STAGE_INTERVAL
    );
  }

  /**
   * Advance to the next startup stage.
   */
  #advanceStage() {
    this.#stageCounter = 0;

    switch (this.#currentStage) {
      case StartupStage.InitialAnnounce:
        this.#currentStage = StartupStage.FirstStageClaim;
        break;
      case StartupStage.FirstStageClaim:
        this.#currentStage = StartupStage.SecondStageClaim;
        break;
      case StartupStage.SecondStageClaim:
        this.#currentStage = StartupStage.FinalStageClaim;
        break;
      case StartupStage.FinalStageClaim:
        this.#currentStage = StartupStage.KeepAlive;
        break;
    }
  }

  /**
   * Start sending keep-alive packets (final stage or when fullStartup is disabled).
   */
  #startKeepAlive() {
    if (this.#intervalHandle) {
      clearTimeout(this.#intervalHandle);
      this.#intervalHandle = undefined;
    }

    // Remove conflict listener once we're in keep-alive mode
    if (this.#conflictListener) {
      this.#announceSocket.off('message', this.#conflictListener);
      this.#conflictListener = undefined;
    }

    const sendKeepAlive = () => {
      const peerCount = this.#deviceManager.devices.size + 1; // +1 for ourselves
      const packet = this.#fullStartup
        ? makeStage06Packet(this.#vcdj, peerCount)
        : makeAnnouncePacket(this.#vcdj);

      const devices = [...this.#deviceManager.devices.values()];
      devices.forEach(device =>
        this.#announceSocket.send(packet, ANNOUNCE_PORT, device.ip.address)
      );

      // Also broadcast if no devices
      if (devices.length === 0) {
        const broadcastAddr = this.#vcdj.ip.endAddress().address;
        this.#announceSocket.send(packet, ANNOUNCE_PORT, broadcastAddr);
      }
    };

    // Send first keep-alive immediately
    sendKeepAlive();

    // Then schedule regular keep-alives
    this.#intervalHandle = setInterval(sendKeepAlive, ANNOUNCE_INTERVAL);
  }

  stop() {
    if (this.#intervalHandle !== undefined) {
      clearInterval(this.#intervalHandle);
      clearTimeout(this.#intervalHandle);
      this.#intervalHandle = undefined;
    }

    // Remove conflict listener if active
    if (this.#conflictListener) {
      this.#announceSocket.off('message', this.#conflictListener);
      this.#conflictListener = undefined;
    }
  }
}
