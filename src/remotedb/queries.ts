import {MessageType, MenuTarget, Message} from 'src/remotedb/message';
import {DeviceID, TrackSlot, TrackType} from 'src/types';
import {UInt32} from 'src/remotedb/fields';
import {Connection} from 'src/remotedb';

/**
 * Specifies the number of items we should request at a time in menu render requests
 */
const LIMIT = 64;

type Descriptor = {
  hostDeviceId: DeviceID;
  menuTarget: MenuTarget;
  trackSlot: TrackSlot;
  trackType: TrackType;
};

export const fieldFromDescriptor = ({
  hostDeviceId,
  menuTarget,
  trackSlot,
  trackType,
}: Descriptor) => new UInt32(Buffer.of(hostDeviceId, menuTarget, trackSlot, trackType));

const makeRenderMessage = (descriptor: Descriptor, offset: number, limit: number) =>
  new Message({
    type: MessageType.RenderMenu,
    args: [
      fieldFromDescriptor(descriptor),
      new UInt32(offset),
      new UInt32(limit),
      new UInt32(0),
      new UInt32(limit),
      new UInt32(0),
    ],
  });

export async function* renderItems(
  conn: Connection,
  descriptor: Descriptor,
  total: number
) {
  let itemsRead = 0;

  while (itemsRead < total) {
    // Request another page of items
    if (itemsRead % LIMIT === 0) {
      const message = makeRenderMessage(descriptor, itemsRead, LIMIT);
      await conn.writeMessage(message);
    }

    // Read each item. Ignoring headers and footers, we will determine when to
    // stop by counting the items read until we reach the total items.
    const resp = await conn.readMessage();

    if (resp.type === MessageType.MenuHeader) {
      continue;
    }

    yield resp;
    itemsRead++;

    // When we've reached the end of a page we must read the footer
    if (itemsRead % LIMIT === 0) {
      await conn.readMessage();
    }
  }
}

export const queryHandlers = {
  [MessageType.GetMetadata]: ({}) => {},
} as const;
