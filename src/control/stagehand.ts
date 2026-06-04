import {PROLINK_HEADER} from 'src/constants';
import {Device} from 'src/types';
import {buildName} from 'src/utils';

/**
 * Generates a Stagehand transport control packet (0x07, 56 bytes)
 *
 * @param hostDevice - The Stagehand device posing as sender
 * @param op - The command opcode (e.g. 0x0f, 0x14, 0x18, 0x1a, 0x1b)
 * @param press - Whether the action is press (true) or release (false)
 * @param correlationByte - The randomized per-session correlation byte
 */
export function makeStagehandTransportPacket(
  hostDevice: Device,
  op: number,
  press: boolean,
  correlationByte: number
): Uint8Array {
  const packet = new Uint8Array(56);

  // 0-9: magic header
  packet.set(PROLINK_HEADER, 0);

  // 10: opcode 0x07
  packet[10] = 0x07;

  // 11-30: device name
  packet.set(buildName(hostDevice), 11);

  // 31: 0x01
  packet[31] = 0x01;

  // 32: 0x03
  packet[32] = 0x03;

  // 33: per-session correlation byte
  packet[33] = correlationByte;

  // 34-35: remaining length 0x0030 (48 bytes)
  packet[34] = 0x00;
  packet[35] = 0x30;

  // 40: Stagehand sub-id 0x3a
  packet[40] = 0x3a;

  // 44: command opcode
  packet[44] = op;

  // 46: press/release flag
  packet[46] = press ? 0x01 : 0x00;

  return packet;
}

/**
 * Generates a Stagehand preference write packet (0x6b, 124 bytes)
 *
 * @param hostDevice - The Stagehand device posing as sender
 * @param options - The preferences to write (onAir, quantize)
 */
export function makeStagehandPrefWritePacket(
  hostDevice: Device,
  options: {onAir?: 'on' | 'off'; quantize?: number}
): Uint8Array {
  const packet = new Uint8Array(124);

  // 0-9: magic header
  packet.set(PROLINK_HEADER, 0);

  // 10: opcode 0x6b
  packet[10] = 0x6b;

  // 11-30: device name
  const name = buildName(hostDevice);
  // Trailing byte 30 (which is offset 30, meaning index 19 of name) is set to 0x03
  name[19] = 0x03;
  packet.set(name, 11);

  // 31: 0x01 (subscription-id-a constant)
  packet[31] = 0x01;

  // 32: 0x03 (constant)
  packet[32] = 0x03;

  // 33: Stagehand sub-id constant 0x3a
  packet[33] = 0x3a;

  // 34-35: body length 0x0050 (80 bytes)
  packet[34] = 0x00;
  packet[35] = 0x50;

  // 36: transaction flag (0x01 = write)
  packet[36] = 0x01;

  // 44: on_air slot (0x80 = OFF, 0x81 = ON, 0x00 = untouched)
  if (options.onAir === 'on') {
    packet[44] = 0x81;
  } else if (options.onAir === 'off') {
    packet[44] = 0x80;
  }

  // 60: quantize slot (0x80 | enum_index, e.g. 0x81, 0x82 etc.)
  if (options.quantize !== undefined) {
    packet[60] = 0x80 | options.quantize;
  }

  return packet;
}
