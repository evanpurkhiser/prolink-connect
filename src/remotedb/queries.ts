import {Span} from '@sentry/tracing';

import * as entities from 'src/entities';

import {Item, Items, ItemType} from './message/item';
import {Request, Response} from './message/types';
import {Binary, UInt32} from './fields';
import {Message} from './message';
import {fieldFromDescriptor, findColor, renderItems} from './utils';
import {Connection, LookupDescriptor, Query} from '.';

/**
 * This module contains logic for each type of query to understand what
 * arguments are required, and how to transform the resulting Items into
 * something useful.
 */

interface HandlerOpts<A extends Record<string, unknown> = Record<string, unknown>> {
  conn: Connection;
  lookupDescriptor: LookupDescriptor;
  span: Span;
  args: A;
}

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
    | ItemType.OriginalArtist;

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
  const track: entities.Track = {
    id: trackItems[ItemType.TrackTitle].id,
    title: trackItems[ItemType.TrackTitle].title,
    duration: trackItems[ItemType.Duration].duration,
    tempo: trackItems[ItemType.Tempo].bpm,
    comment: trackItems[ItemType.Comment].comment,
    rating: trackItems[ItemType.Rating].rating,
    year: trackItems?.[ItemType.Year]?.year,
    bitrate: trackItems?.[ItemType.BitRate]?.bitrate,

    artwork: {id: trackItems[ItemType.TrackTitle].artworkId},
    album: trackItems[ItemType.AlbumTitle],
    artist: trackItems[ItemType.Artist],
    genre: trackItems[ItemType.Genre],
    key: trackItems[ItemType.Key],
    color: findColor(Object.values(trackItems))!,
    label: trackItems[ItemType.Label] ?? null,
    remixer: trackItems?.[ItemType.Remixer] ?? null,
    originalArtist: trackItems?.[ItemType.OriginalArtist] ?? null,
    composer: null,

    fileName: '',
    filePath: '',

    beatGrid: null,
    cueAndLoops: null,
    waveformHd: null,
  };

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
  type GenericMetadataItems =
    | ItemType.AlbumTitle
    | ItemType.TrackTitle
    | ItemType.Genre
    | ItemType.Artist
    | ItemType.Rating
    | ItemType.Duration
    | ItemType.Tempo
    | ItemType.BitRate
    | ItemType.Comment;

  const items = renderItems<GenericMetadataItems>(
    conn,
    lookupDescriptor,
    resp.data.itemsAvailable,
    span
  );

  // NOTE: We do a bit of any-ing here to help typescript understand we're
  // discriminating the type by our object key
  const fileItems: Pick<Items, GenericMetadataItems> = {} as any;
  for await (const item of items) {
    fileItems[item.type] = item as any;
  }

  // Translate our fileItems into a (partial) Track entity.
  const track: entities.Track = {
    id: fileItems[ItemType.TrackTitle].id,
    title: fileItems[ItemType.TrackTitle].title,
    duration: fileItems[ItemType.Duration].duration,
    tempo: fileItems[ItemType.Tempo].bpm,
    comment: fileItems[ItemType.Comment].comment,
    rating: fileItems[ItemType.Rating].rating,
    bitrate: fileItems[ItemType.BitRate].bitrate,

    artwork: {id: fileItems[ItemType.TrackTitle].artworkId},
    album: fileItems?.[ItemType.AlbumTitle],
    artist: fileItems[ItemType.Artist],
    genre: fileItems[ItemType.Genre],
    color: findColor(Object.values(fileItems))!,

    fileName: '',
    filePath: '',

    key: null,
    label: null,
    remixer: null,
    originalArtist: null,
    composer: null,

    beatGrid: null,
    cueAndLoops: null,
    waveformHd: null,
  };

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

type PlaylistQueryOpts = HandlerOpts<{
  /**
   * The ID of the playlist to query for. May be left blank to query the root
   * playlist folder.
   */
  id?: number;
  /**
   * When querying for a playlist folder this must be true.
   */
  isFolderRequest: boolean;
}>;

/**
 * Lookup playlist entries
 */
async function getPlaylist(opts: PlaylistQueryOpts) {
  const {conn, lookupDescriptor, span, args} = opts;

  // XXX: The or operator is correct here to coerece `0` into null to keep a
  // consistent representation of parentId.
  const parentId = args.id || null;

  // TODO: Maybe sort could become a parameter
  const sort = new UInt32(0);
  const id = new UInt32(parentId ?? 0);
  const isFolder = new UInt32(args.isFolderRequest ? 0x1 : 0x0);

  const request = new Message({
    type: Request.MenuPlaylist,
    args: [fieldFromDescriptor(lookupDescriptor), sort, id, isFolder],
  });

  await conn.writeMessage(request, span);
  const resp = await conn.readMessage(Response.Success, span);

  type PlaylistItemTypes = ItemType.Folder | ItemType.Playlist | ItemType.TrackTitle;

  const items = renderItems<PlaylistItemTypes>(
    conn,
    lookupDescriptor,
    resp.data.itemsAvailable,
    span
  );

  const playlistItems: Array<Item<PlaylistItemTypes>> = [];
  for await (const item of items) {
    playlistItems.push(item);
  }

  const folders: entities.Playlist[] = (playlistItems as Array<Item<ItemType.Folder>>)
    .filter(item => item.type === ItemType.Folder)
    .map(({id, name}) => ({isFolder: true, id, name, parentId}));

  const playlists: entities.Playlist[] = (playlistItems as Array<Item<ItemType.Playlist>>)
    .filter(item => item.type === ItemType.Playlist)
    .map(({id, name}) => ({isFolder: false, id, name, parentId}));

  const trackEntries = (playlistItems as Array<Item<ItemType.TrackTitle>>).filter(
    item => item.type === ItemType.TrackTitle
  );

  return {folders, playlists, trackEntries};
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
  [Request.MenuPlaylist]: getPlaylist,

  // TODO: Add queries for all different kinds of menu requests
};

export type Handler<T extends Query> = (typeof queryHandlers)[T];

export type HandlerArgs<T extends Query> = Parameters<Handler<T>>[0]['args'];
export type HandlerReturn<T extends Query> = ReturnType<Handler<T>>;
