import {Span} from '@sentry/tracing';

import * as entities from 'src/entities';

import {Connection, LookupDescriptor, Query} from '.';
import {fieldFromDescriptor, renderItems, findColor} from './utils';
import {Request, Response} from './message/types';
import {Items, ItemType} from './message/item';
import {Message} from './message';
import {UInt32, Binary} from './fields';

/**
 * This module contains logic for each type of query to understand what
 * arguments are required, and how to transform the resulting Items into
 * something useful.
 */

type HandlerOpts<A extends Record<string, unknown> = Record<string, unknown>> = {
  conn: Connection;
  lookupDescriptor: LookupDescriptor;
  span: Span;
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
  const {conn, lookupDescriptor, span, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetMetadata,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request, span);
  const resp = await conn.readMessage(Response.Success, span);

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
    | ItemType.BitRate
    | ItemType.Remixer
    | ItemType.Year
    | ItemType.OrigianlArtist;

  const items = renderItems<MetadataItems>(
    conn,
    lookupDescriptor,
    resp.data.itemsAvailable,
    span
  );

  // NOTE: We do a bit of any-ing here to help typescript understand we're
  // discriminating the type by our object key
  const trackItems: Pick<Items, MetadataItems> = {} as any;
  for await (const item of items) {
    trackItems[item.type] = item as any;
  }

  // Translate our trackItems into a (partial) Track entity.
  const track = new entities.Track();
  track.id = trackItems[ItemType.TrackTitle].id;
  track.title = trackItems[ItemType.TrackTitle].title;
  track.duration = trackItems[ItemType.Duration].duration;
  track.tempo = trackItems[ItemType.Tempo].bpm;
  track.comment = trackItems[ItemType.Comment].comment;
  track.rating = trackItems[ItemType.Rating].rating;

  track.artwork = new entities.Artwork();
  track.artwork.id = trackItems[ItemType.TrackTitle].artworkId;

  track.album = new entities.Album();
  track.album.id = trackItems[ItemType.AlbumTitle].id;
  track.album.name = trackItems[ItemType.AlbumTitle].name;

  track.artist = new entities.Artist();
  track.artist.id = trackItems[ItemType.Artist].id;
  track.artist.name = trackItems[ItemType.Artist].name;

  track.genre = new entities.Genre();
  track.genre.id = trackItems[ItemType.Genre].id;
  track.genre.name = trackItems[ItemType.Genre].name;

  track.key = new entities.Key();
  track.key.id = trackItems[ItemType.Key].id;
  track.key.name = trackItems[ItemType.Key].name;

  const color = findColor(Object.values(trackItems))!;
  track.color = new entities.Color();
  track.color.id = color.id;
  track.color.name = color.name;

  if (ItemType.BitRate in trackItems) {
    track.bitrate = trackItems[ItemType.BitRate].bitrate;
  }

  if (ItemType.Label in trackItems) {
    track.label = new entities.Label();
    track.label.id = trackItems[ItemType.Label].id;
    track.label.name = trackItems[ItemType.Label].name;
  }

  if (ItemType.Year in trackItems) {
    track.year = trackItems[ItemType.Year].year;
  }

  if (ItemType.Remixer in trackItems) {
    track.remixer = new entities.Artist();
    track.remixer.id = trackItems[ItemType.Remixer].id;
    track.remixer.name = trackItems[ItemType.Remixer].name;
  }

  if (ItemType.OrigianlArtist in trackItems) {
    track.originalArtist = new entities.Artist();
    track.originalArtist.id = trackItems[ItemType.OrigianlArtist].id;
    track.originalArtist.name = trackItems[ItemType.OrigianlArtist].name;
  }

  return track;
}

/**
 * Lookup generic metadata for an unanalyzed track
 */
async function getGenericMetadata(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetGenericMetadata,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request, span);
  const resp = await conn.readMessage(Response.Success, span);

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
    resp.data.itemsAvailable,
    span
  );

  // NOTE: We do a bit of any-ing here to help typescript understand we're
  // discriminating the type by our object key
  const fileItems: Pick<Items, GenericMetadtaItems> = {} as any;
  for await (const item of items) {
    fileItems[item.type] = item as any;
  }

  // Translate our fileItems into a (partial) Track entity.
  const track = new entities.Track();
  track.id = fileItems[ItemType.TrackTitle].id;
  track.title = fileItems[ItemType.TrackTitle].title;
  track.duration = fileItems[ItemType.Duration].duration;
  track.tempo = fileItems[ItemType.Tempo].bpm;
  track.rating = fileItems[ItemType.Rating].rating;
  track.comment = fileItems[ItemType.Comment].comment;
  track.bitrate = fileItems[ItemType.BitRate].bitrate;

  track.artwork = new entities.Artwork();
  track.artwork.id = fileItems[ItemType.TrackTitle].artworkId;

  track.album = new entities.Album();
  track.album.id = fileItems[ItemType.AlbumTitle].id;
  track.album.name = fileItems[ItemType.AlbumTitle].name;

  track.artist = new entities.Artist();
  track.artist.id = fileItems[ItemType.Artist].id;
  track.artist.name = fileItems[ItemType.Artist].name;

  track.genre = new entities.Genre();
  track.genre.id = fileItems[ItemType.Genre].id;
  track.genre.name = fileItems[ItemType.Genre].name;

  const color = findColor(Object.values(fileItems))!;
  track.color = new entities.Color();
  track.color.id = color.id;
  track.color.name = color.name;

  return track;
}

/**
 * Lookup the artwork image given the artworkId obtained from a track
 */
async function getArtwork(opts: HandlerOpts<{artworkId: number}>) {
  const {conn, lookupDescriptor, span, args} = opts;
  const {artworkId} = args;

  const request = new Message({
    type: Request.GetArtwork,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(artworkId)],
  });

  await conn.writeMessage(request, span);
  const art = await conn.readMessage(Response.Artwork, span);

  return art.data;
}

/**
 * Lookup the beatgrid for the specified trackId
 */
async function getBeatgrid(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetBeatGrid,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request, span);
  const grid = await conn.readMessage(Response.BeatGrid, span);

  return grid.data;
}

/**
 * Lookup the waveform preview for the specified trackId
 */
async function getWaveformPreview(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
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

  await conn.writeMessage(request, span);
  const waveformPreview = await conn.readMessage(Response.WaveformPreview, span);

  return waveformPreview.data;
}

/**
 * Lookup the detailed waveform for the specified trackId
 */
async function getWaveformDetailed(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetWaveformDetailed,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId), new UInt32(0)],
  });

  await conn.writeMessage(request, span);
  const waveformDetailed = await conn.readMessage(Response.WaveformDetailed, span);

  return waveformDetailed.data;
}

/**
 * Lookup the HD (nexus2) waveform for the specified trackId
 */
async function getWaveformHD(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
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

  await conn.writeMessage(request, span);
  const waveformHD = await conn.readMessage(Response.WaveformHD, span);

  return waveformHD.data;
}

/**
 * Lookup the [hot]cue points and [hot]loops for a track
 */
async function getCueAndLoops(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetCueAndLoops,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request, span);
  const cueAndLoops = await conn.readMessage(Response.CueAndLoop, span);

  return cueAndLoops.data;
}

/**
 * Lookup the "advanced" (nexus2) [hot]cue points and [hot]loops for a track
 */
async function getCueAndLoopsAdv(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetAdvCueAndLoops,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId), new UInt32(0)],
  });

  await conn.writeMessage(request, span);
  const advCueAndLoops = await conn.readMessage(Response.AdvCueAndLoops, span);

  return advCueAndLoops.data;
}

/**
 * Lookup the track information, currently just returns the track path
 */
async function getTrackInfo(opts: TrackQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;
  const {trackId} = args;

  const request = new Message({
    type: Request.GetTrackInfo,
    args: [fieldFromDescriptor(lookupDescriptor), new UInt32(trackId)],
  });

  await conn.writeMessage(request, span);
  const resp = await conn.readMessage(Response.Success, span);

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
    resp.data.itemsAvailable,
    span
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
