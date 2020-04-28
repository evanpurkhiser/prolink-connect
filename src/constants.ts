/**
 * The port on which devices on the prolink network announce themselves.
 */
export const ANNOUNCE_PORT = 50000;

/**
 * The port on which devices on the prolink network announce themselves.
 */
export const STATUS_PORT = 50002;

// prettier-ignore
/**
 * All UDP packets on the PRO DJ LINK network start with this magic header.
 */
export const PROLINK_HEADER = Uint8Array.of(
  0x51, 0x73, 0x70, 0x74, 0x31,
  0x57, 0x6d, 0x4a, 0x4f, 0x4c
);

/**
 * VirtualCDJName is the name given to the Virtual CDJ device.
 */
export const VIRTUAL_CDJ_NAME = 'prolink-typescript';

/**
 * VirtualCDJFirmware is a string indicating the firmware version reported with
 * status packets.
 */
export const VIRTUAL_CDJ_FIRMWARE = '1.43';
