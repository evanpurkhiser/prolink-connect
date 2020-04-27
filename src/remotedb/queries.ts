import {Track} from 'src/entities';

import {Connection, LookupDescriptor, Query} from '.';
import {fieldFromDescriptor, renderItems} from './utils';
import {Request, Response} from './message/types';
import {Items, ItemType} from './message/item';
import {Message} from './message';
import {UInt32, Binary} from './fields';

/**
 * This module contains logic for each type of query to udnerstand what
 * arguments are required, and how to transform the resulting Items into
 * something useful.
 */

type HandlerOpts<A extends object = {}> = {
  conn: Connection;
  lookupDescriptor: LookupDescriptor;
  args: A;
};

// Track lookups are so common that we specify an alias specifically for track
// lookup query options.

type TrackQueryOpts = HandlerOpts<{
  /**
   * The ID of the track to query for
   */
  trackId: number;
}>;

/**
 * Lookup track metadata from rekordbox and coerce it into a Track entity
 */
async function getMetadata(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetMetadata,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request);
  const resp = await conn.readMessage(Response.Success);

  // We'll get back these specific items when rendering out the items
  //
  // NOTE: We actually also get back a color, but we'll find that one later,
  // since each color is it's own item type.
  type MetadataItems =
    | ItemType.AlbumTitle
    | ItemType.TrackTitle
    | ItemType.Genre
    | ItemType.Artist
    | ItemType.Rating
    | ItemType.Duration
    | ItemType.Tempo
    | ItemType.Label
    | ItemType.Key
    | ItemType.Comment
    | ItemType.DateAdded;

  const items = renderItems<MetadataItems>(
    conn,
    lookupDescriptor,
    resp.data.itemsAvailable
  );

  // NOTE: We do a bit of any-ing here to help typescript understand we're
  // discriminating the type by our object key
  const trackItems: Pick<Items, MetadataItems> = {} as any;
  for await (const item of items) {
    trackItems[item.type] = item as any;
  }

  console.log(Object.keys(trackItems));

  // Translate our trackItems into a (partial) Track entity.
  const track = new Track();
  track.id = trackItems[ItemType.TrackTitle].id;
  track.title = trackItems[ItemType.TrackTitle].title;

  // TODO: Fill tihs all out
  // TODO: Color lookup

  return track;
}

/**
 * Lookup generic metadata for an unanalyzed track
 */
async function getGenericMetadata(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetGenericMetadata,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request);
  const resp = await conn.readMessage(Response.Success);

  // NOTE: We actually also get back a color, but we'll find that one later,
  // since each color is it's own item type.
  type GenericMetadtaItems =
    | ItemType.AlbumTitle
    | ItemType.TrackTitle
    | ItemType.Genre
    | ItemType.Artist
    | ItemType.Rating
    | ItemType.Duration
    | ItemType.Tempo
    | ItemType.BitRate
    | ItemType.Comment;

  const items = renderItems<GenericMetadtaItems>(
    conn,
    lookupDescriptor,
    resp.data.itemsAvailable
  );

  // NOTE: We do a bit of any-ing here to help typescript understand we're
  // discriminating the type by our object key
  const fileItems: Pick<Items, GenericMetadtaItems> = {} as any;
  for await (const item of items) {
    fileItems[item.type] = item as any;
  }

  // Translate our fileItems into a (partial) Track entity.
  const track = new Track();
  track.id = fileItems[ItemType.TrackTitle].id;
  track.title = fileItems[ItemType.TrackTitle].title;

  // TODO: Fill tihs all out
  // TODO: Color lookup

  return track;
}

/**
 * Lookup the artwork image given the artworkId obtained from a track
 */
async function getArtwork(opts: HandlerOpts<{artworkId: number}>) {
  const {conn, lookupDescriptor, args} = opts;
  const {artworkId} = args;

  const request = new Message({
    type: Request.GetArtwork,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(artworkId)],
  });

  await conn.writeMessage(request);
  const art = await conn.readMessage(Response.Artwork);

  return art.data;
}

/**
 * Lookup the beatgrid for the specified trackId
 */
async function getBeatgrid(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetBeatGrid,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request);
  const grid = await conn.readMessage(Response.BeatGrid);

  return grid.data;
}

/**
 * Lookup the waveform preview for the specified trackId
 */
async function getWaveformPreview(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetWaveformPreview,
    args: [
      fieldFromDescriptor(lookupDescriptor),
      new UInt32(0),
      new UInt32(trackId),
      new UInt32(0),
      new Binary(Buffer.alloc(0)),
    ],
  });

  await conn.writeMessage(request);
  const waveformPreview = await conn.readMessage(Response.WaveformPreview);

  return waveformPreview.data;
}

/**
 * Lookup the detailed waveform for the specified trackId
 */
async function getWaveformDetailed(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetWaveformDetailed,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId), new UInt32(0)],
  });

  await conn.writeMessage(request);
  const waveformDetailed = await conn.readMessage(Response.WaveformDetailed);

  return waveformDetailed.data;
}

/**
 * Lookup the HD (nexus2) waveform for the specified trackId
 */
async function getWaveformHD(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetWaveformHD,
    args: [
      fieldFromDescriptor(lookupDescriptor),
      new UInt32(trackId),
      new UInt32(Buffer.from('PWV5').readUInt32LE()),
      new UInt32(Buffer.from('EXT\0').readUInt32LE()),
    ],
  });

  await conn.writeMessage(request);
  const waveformHD = await conn.readMessage(Response.WaveformHD);

  return waveformHD.data;
}

/**
 * Lookup the [hot]cue points and [hot]loops for a track
 */
async function getCueAndLoops(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetCueAndLoops,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request);
  const cueAndLoops = await conn.readMessage(Response.CueAndLoop);

  return cueAndLoops.data;
}

/**
 * Lookup the "advanced" (nexus2) [hot]cue points and [hot]loops for a track
 */
async function getCueAndLoopsAdv(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetAdvCueAndLoops,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId), new UInt32(0)],
  });

  await conn.writeMessage(request);
  const advCueAndLoops = await conn.readMessage(Response.AdvCueAndLoops);

  return advCueAndLoops.data;
}

/**
 * Lookup the track information, currently just returns the track path
 */
async function getTrackInfo(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetTrackInfo,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request);
  const resp = await conn.readMessage(Response.Success);

  type TrackInfoItems =
    | ItemType.TrackTitle
    | ItemType.Path
    | ItemType.Duration
    | ItemType.Tempo
    | ItemType.Comment
    | ItemType.Unknown01;

  const items = renderItems<TrackInfoItems>(
    conn,
    lookupDescriptor,
    resp.data.itemsAvailable
  );

  const infoItems: Pick<Items, TrackInfoItems> = {} as any;
  for await (const item of items) {
    infoItems[item.type] = item as any;
  }

  return infoItems[ItemType.Path].path;
}

export const queryHandlers = {
  [Request.GetMetadata]: getMetadata,
  [Request.GetArtwork]: getArtwork,
  [Request.GetWaveformPreview]: getWaveformPreview,
  [Request.GetTrackInfo]: getTrackInfo,
  [Request.GetGenericMetadata]: getGenericMetadata,
  [Request.GetCueAndLoops]: getCueAndLoops,
  [Request.GetBeatGrid]: getBeatgrid,
  [Request.GetWaveformDetailed]: getWaveformDetailed,
  [Request.GetAdvCueAndLoops]: getCueAndLoopsAdv,
  [Request.GetWaveformHD]: getWaveformHD,

  // TODO: Add queries for all different kinds of menu requests
};

export type Handler<T extends Query> = typeof queryHandlers[T];

export type HandlerArgs<T extends Query> = Parameters<Handler<T>>[0]['args'];
export type HandlerReturn<T extends Query> = ReturnType<Handler<T>>;
