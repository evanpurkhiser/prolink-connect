import StrictEventEmitter from 'strict-event-emitter-types';

import {EventEmitter} from 'events';

import {ANNOUNCE_PORT, BEAT_PORT, STATUS_PORT} from 'src/constants';

// Cap module types - this is a native pcap module
// Type definitions are inline since @types/cap doesn't exist
interface CapInstance {
  on(event: 'packet', handler: (nbytes: number, truncated: boolean) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  setMinBytes(bytes: number): void;
  close(): void;
  open(
    device: string,
    filter: string,
    bufSize: number,
    buffer: Buffer,
    linkType?: string
  ): void;
  send(buffer: Buffer, len: number): boolean;
  linkType: string;
}

// Protocol constants for packet decoding
interface ProtocolConstants {
  ETHERNET: {IPV4: number};
  IP: {UDP: number};
}

interface CapModule {
  Cap: new () => CapInstance;
  decoders: {
    PROTOCOL: ProtocolConstants;
    Ethernet: (buf: Buffer) => {info: {type: number}; offset: number};
    IPV4: (
      buf: Buffer,
      offset: number
    ) => {
      info: {protocol: number; srcaddr: string; dstaddr: string; totallen: number};
      offset: number;
    };
    UDP: (
      buf: Buffer,
      offset: number
    ) => {
      info: {srcport: number; dstport: number; length: number};
      offset: number;
    };
  };
}

/**
 * Packet info including source IP (useful for short-format packets
 * where the IP may not be fully present in the payload).
 */
export interface PacketInfo {
  /** The UDP payload */
  payload: Buffer;
  /** Source IP address (e.g., '169.254.88.83') */
  srcAddr: string;
}

interface PcapAdapterEvents {
  /**
   * Fired when a device announcement packet is received (port 50000)
   */
  announce: (packet: Buffer, info: PacketInfo) => void;
  /**
   * Fired when a status packet is received (port 50002)
   */
  status: (packet: Buffer, info: PacketInfo) => void;
  /**
   * Fired when a beat/position packet is received (port 50001)
   */
  beat: (packet: Buffer, info: PacketInfo) => void;
  /**
   * Fired when an error occurs
   */
  error: (error: Error) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, PcapAdapterEvents>;

export interface PcapAdapterConfig {
  /**
   * Network interface name (e.g., 'en0', 'eth0', 'en15')
   */
  iface: string;
  /**
   * Buffer size for packet capture in bytes
   * @default 10485760 (10MB)
   */
  bufferSize?: number;
}

/**
 * PcapAdapter captures Pro DJ Link packets via pcap (libpcap).
 * It extracts UDP payloads and emits them to event listeners based on
 * destination port.
 *
 * This allows passive monitoring of the Pro DJ Link network without
 * binding to UDP ports or announcing a virtual CDJ.
 *
 * NOTE: Requires root/sudo privileges for packet capture.
 */
export class PcapAdapter {
  #emitter: Emitter = new EventEmitter();
  #cap: CapInstance | null = null;
  #buffer: Buffer;
  #iface: string;
  #started = false;

  constructor(config: PcapAdapterConfig) {
    this.#iface = config.iface;
    this.#buffer = Buffer.alloc(config.bufferSize ?? 10 * 1024 * 1024); // 10MB default
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Start capturing packets on the configured interface.
   * Requires root/sudo privileges.
   */
  start() {
    if (this.#started) {
      return;
    }

    // Dynamic require to avoid bundling issues and allow optional dependency
    let cap: CapModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cap = require('cap') as CapModule;
    } catch {
      throw new Error(
        'The "cap" module is required for passive mode. ' +
          'Install it with: npm install cap\n' +
          'Note: Requires libpcap-dev on Linux or Npcap/WinPcap on Windows.'
      );
    }

    const {Cap, decoders} = cap;
    const PROTOCOL = decoders.PROTOCOL;

    this.#cap = new Cap();

    // BPF filter for Pro DJ Link UDP ports
    const filter = `udp and (port ${ANNOUNCE_PORT} or port ${BEAT_PORT} or port ${STATUS_PORT})`;

    try {
      this.#cap.open(this.#iface, filter, 65535, this.#buffer);
    } catch (err) {
      throw new Error(
        `Failed to open interface "${this.#iface}" for packet capture. ` +
          `Ensure you have root/sudo privileges and the interface exists.\n` +
          `Original error: ${err}`
      );
    }

    // setMinBytes may not be available on all platforms
    if (typeof this.#cap.setMinBytes === 'function') {
      this.#cap.setMinBytes(0);
    }

    this.#cap.on('packet', (nbytes: number, truncated: boolean) => {
      if (truncated) {
        return;
      }

      try {
        // Parse Ethernet header
        const ethResult = decoders.Ethernet(this.#buffer);
        if (ethResult.info.type !== PROTOCOL.ETHERNET.IPV4) {
          return;
        }

        // Parse IPv4 header
        const ipResult = decoders.IPV4(this.#buffer, ethResult.offset);
        if (ipResult.info.protocol !== PROTOCOL.IP.UDP) {
          return;
        }

        // Parse UDP header
        const udpResult = decoders.UDP(this.#buffer, ipResult.offset);
        const dstPort = udpResult.info.dstport;
        const udpPayloadOffset = udpResult.offset;
        const udpPayloadLen = udpResult.info.length - 8; // UDP header is 8 bytes

        if (udpPayloadLen <= 0) {
          return;
        }

        // Extract the UDP payload as a new Buffer (copy to avoid overwrite)
        const payload = Buffer.alloc(udpPayloadLen);
        this.#buffer.copy(payload, 0, udpPayloadOffset, udpPayloadOffset + udpPayloadLen);

        // Build packet info with source IP (useful when payload doesn't contain full IP)
        const info: PacketInfo = {
          payload,
          srcAddr: ipResult.info.srcaddr,
        };

        // Emit to appropriate handler based on destination port
        switch (dstPort) {
          case ANNOUNCE_PORT:
            this.#emitter.emit('announce', payload, info);
            break;
          case BEAT_PORT:
            this.#emitter.emit('beat', payload, info);
            break;
          case STATUS_PORT:
            this.#emitter.emit('status', payload, info);
            break;
        }
      } catch (err) {
        this.#emitter.emit('error', err as Error);
      }
    });

    this.#cap.on('error', (err: Error) => {
      this.#emitter.emit('error', err);
    });

    this.#started = true;
  }

  /**
   * Stop capturing packets and release resources.
   */
  stop() {
    if (this.#cap) {
      this.#cap.close();
      this.#cap = null;
    }
    this.#started = false;
  }

  /**
   * Check if the adapter is currently capturing.
   */
  get isCapturing() {
    return this.#started;
  }

  /**
   * Get the interface name being captured.
   */
  get interfaceName() {
    return this.#iface;
  }
}

export default PcapAdapter;
