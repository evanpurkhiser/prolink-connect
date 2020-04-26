import {Track} from 'src/entities';

import {LookupDescriptor, Connection} from '.';
import {fieldFromDescriptor, renderItems} from './utils';
import {MessageType} from './message/types';
import {Items, ItemType} from './message/item';
import {Message} from './message';
import {UInt32} from './fields';

/**
 * This module contains logic for each type of query to udnerstand what
 * arguments are required, and how to transform the resulting Items into
 * something useful.
 */

type HandlerArgs<Q extends object = {}> = {
  conn: Connection;
  lookupDescriptor: LookupDescriptor;
  args: Q;
};

/**
 * Lookup track metadata
 */
async function getMetadata(opts: HandlerArgs<{trackId: number}>) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const trackRequest = new Message({
    type: MessageType.GetMetadata,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(trackRequest);
  const resp = await conn.readMessage(MessageType.Success);

  // We'll get back these specific items when rendering out the items
  //
  // NOTE: We actually also get back a color, but we'll find that one later,
  // since each color is it's own item type.
  type MetadataItems =
    | ItemType.AlbumTitle
    | ItemType.Artist
    | ItemType.Comment
    | ItemType.Disc
    | ItemType.Duration
    | ItemType.Genre
    | ItemType.Key
    | ItemType.Label
    | ItemType.Rating
    | ItemType.TrackTitle
    | ItemType.Year;

  const items = renderItems<MetadataItems>(
    conn,
    lookupDescriptor,
    resp.data.itemsAvailable
  );

  // NOTE: We do a bit of any-ing here to help typescript understand we're
  // discriminating the type into our map
  const trackItems: Pick<Items, MetadataItems> = {} as any;
  for await (const item of items) {
    trackItems[item.type] = item as any;
  }

  // Translate our trackItems into a (partial) Track entity.
  const track = new Track();
  track.id = trackItems[ItemType.TrackTitle].id;
  track.title = trackItems[ItemType.TrackTitle].title;

  return track;
}

export const queryHandlers = {
  [MessageType.GetMetadata]: getMetadata,
  [MessageType.GetArtwork]: ({}: HandlerArgs) => null,
  [MessageType.GetWaveformPreview]: ({}: HandlerArgs) => null,
  [MessageType.GetTrackInfo]: ({}: HandlerArgs) => null,
  [MessageType.GetGenericMetadata]: ({}: HandlerArgs) => null,
  [MessageType.GetCueAndLoops]: ({}: HandlerArgs) => null,
  [MessageType.GetBeatGrid]: ({}: HandlerArgs) => null,
  [MessageType.GetWaveformDetailed]: ({}: HandlerArgs) => null,
  [MessageType.GetAdvCueAndLoops]: ({}: HandlerArgs) => null,
  [MessageType.GetWaveformHD]: ({}: HandlerArgs) => null,
};

//const trackRequest = new Message({
//  type: MessageType.GetMetadata,
//  args: [fieldFromDescriptor(trackDescriptor), new UInt32(8428)],
//});

//const conn = this.connections[device.id];

//await conn.writeMessage(trackRequest);
//const resp = await conn.readMessage(MessageType.Success);

//const items = renderItems(conn, trackDescriptor, resp.data.itemsAvailable);

//const data: Partial<Items> = {};
//for await (const item of items) {
//  data[item.type] = item as any;
//}

//console.log(data[ItemType.TrackTitle]?.title);

//const artId = data[ItemType.TrackTitle]?.artworkId ?? 0;

//const artRequest = new Message({
//  type: MessageType.GetArtwork,
//  args: [fieldFromDescriptor(trackDescriptor), new UInt32(artId)],
//});

//await conn.writeMessage(artRequest);
//const art = await conn.readMessage(MessageType.Artwork);

//const beatGrid = new Message({
//  type: MessageType.GetBeatGrid,
//  args: [fieldFromDescriptor(trackDescriptor), new UInt32(9688)],
//});

//await conn.writeMessage(beatGrid);
//const grid = await conn.readMessage(MessageType.BeatGrid);

////console.log(grid.data);

//const waveformPreview = new Message({
//  type: MessageType.GetWaveformPreview,
//  args: [
//    fieldFromDescriptor(trackDescriptor),
//    new UInt32(0),
//    new UInt32(6616),
//    new UInt32(0),
//    new Binary(Buffer.alloc(0)),
//  ],
//});

//await conn.writeMessage(waveformPreview);
//const previewWave = await conn.readMessage(MessageType.WaveformPreview);

////console.log(previewWave.data);

//const waveformDetailed = new Message({
//  type: MessageType.GetWaveformDetailed,
//  args: [fieldFromDescriptor(trackDescriptor), new UInt32(6616), new UInt32(0)],
//});

//await conn.writeMessage(waveformDetailed);
//const pv = await conn.readMessage(MessageType.WaveformDetailed);

////console.log(pv.data);

//const waveformHd = new Message({
//  type: MessageType.GetWaveformHD,
//  args: [
//    fieldFromDescriptor(trackDescriptor),
//    new UInt32(10010),
//    new UInt32(Buffer.from('PWV5').readUInt32LE()),
//    new UInt32(Buffer.from('EXT\0').readUInt32LE()),
//  ],
//});

//await conn.writeMessage(waveformHd);
//const hd = await conn.readMessage(MessageType.WaveformHD);

////console.log(hd.data);

//const cueLoops = new Message({
//  type: MessageType.GetCueAndLoops,
//  args: [fieldFromDescriptor(trackDescriptor), new UInt32(10010)],
//});

//await conn.writeMessage(cueLoops);
//const cl = await conn.readMessage(MessageType.CueAndLoop);

////console.log(cl.data);

//const advCueLoops = new Message({
//  type: MessageType.GetAdvCueAndLoops,
//  args: [fieldFromDescriptor(trackDescriptor), new UInt32(9688), new UInt32(0)],
//});

//await conn.writeMessage(advCueLoops);
//const acl = await conn.readMessage(MessageType.AdvCueAndLoops);

////console.log(acl.data);
