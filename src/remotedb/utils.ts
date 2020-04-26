import {Connection, LookupDescriptor} from '.';
import {Message} from './message';
import {UInt32} from './fields';
import {MessageType} from './message/types';
import {ItemType, Items} from './message/item';

/**
 * Specifies the number of items we should request at a time in menu render
 * requests.
 */
const LIMIT = 64;

export const fieldFromDescriptor = ({
  hostDevice,
  menuTarget,
  trackSlot,
  trackType,
}: LookupDescriptor) =>
  new UInt32(Buffer.of(hostDevice.id, menuTarget, trackSlot, trackType));

export const makeRenderMessage = (
  descriptor: LookupDescriptor,
  offset: number,
  limit: number
) =>
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

export async function* renderItems<T extends ItemType = ItemType>(
  conn: Connection,
  descriptor: LookupDescriptor,
  total: number
) {
  let itemsRead = 0;

  while (itemsRead < total) {
    // Request another page of items
    if (itemsRead % LIMIT === 0) {
      const message = makeRenderMessage(descriptor, itemsRead, LIMIT);
      await conn.writeMessage(message);
      await conn.readMessage(MessageType.MenuHeader);
    }

    // Read each item. Ignoring headers and footers, we will determine when to
    // stop by counting the items read until we reach the total items.
    const resp = await conn.readMessage(MessageType.MenuItem);

    yield resp.data as Items[T];
    itemsRead++;

    // When we've reached the end of a page we must read the footer
    if (itemsRead % LIMIT === 0 || itemsRead === total) {
      await conn.readMessage(MessageType.MenuFooter);
    }
  }
}
