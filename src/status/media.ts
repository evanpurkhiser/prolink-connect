import {PROLINK_HEADER} from 'src/constants';
import {Device, MediaSlot} from 'src/types';
import {buildName} from 'src/utils';

interface Options {
  /**
   * The device asking for media info
   */
  hostDevice: Device;
  /**
   * The target device. This is the device we'll be querying for details of
   * it's media slot.
   */
  device: Device;
  /**
   * The specific slot
   */
  slot: MediaSlot;
}

/**
 * Get information about the media connected to the specified slot on the
 * device.
 */
export const makeMediaSlotRequest = ({hostDevice, device, slot}: Options) =>
  Uint8Array.from([
    ...PROLINK_HEADER,
    ...[0x05],
    ...buildName(hostDevice),
    ...[0x01, 0x00],
    ...[hostDevice.id],
    ...[0x00, 0x0c],
    ...hostDevice.ip.toArray(),
    ...[0x00, 0x00, 0x00, device.id],
    ...[0x00, 0x00, 0x00, slot],
  ]);
