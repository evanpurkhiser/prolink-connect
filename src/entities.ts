import {BeatGrid, CueAndLoop, WaveformHD} from 'src/types';

/**
 * Documentation type strictly for use with entities that have foreign key
 * attributes.
 */
export enum EntityFK {
  WithFKs,
  WithRelations,
}

export interface Artwork {
  id: number;
  path?: string;
}

export interface Key {
  id: number;
  name: string;
}

export interface Label {
  id: number;
  name: string;
}

export interface Color {
  id: number;
  name: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Album {
  id: number;
  name: string;
}

export interface Artist {
  id: number;
  name: string;
}

export interface Playlist {
  id: number;
  name: string;
  isFolder: boolean;
  parentId: number | null;
}

interface PlaylistEntryRelations {
  track: Track;
}

interface PlaylistEntryFks {
  playlistId: number;
  trackId: number;
}

export type PlaylistEntry<withFKs extends EntityFK = EntityFK.WithRelations> = {
  id: number;
  sortIndex: number;
} & (withFKs extends EntityFK.WithFKs ? PlaylistEntryFks : PlaylistEntryRelations);

interface TrackRelations {
  artwork: Artwork | null;
  artist: Artist | null;
  originalArtist: Artist | null;
  remixer: Artist | null;
  composer: Artist | null;
  album: Album | null;
  label: Label | null;
  genre: Genre | null;
  color: Color | null;
  key: Key | null;
}

interface TrackFks {
  artworkId?: number;
  artistId?: number;
  originalArtistId?: number;
  remixerId?: number;
  composerId?: number;
  albumId?: number;
  labelId?: number;
  genreId?: number;
  colorId?: number;
  keyId?: number;
}

/**
 * Represents a track.
 *
 * Note, fields that are not optional will be set for all database request
 * methods.
 */
export type Track<withFKs extends EntityFK = EntityFK.WithRelations> = {
  id: number;
  title: string;
  duration: number;
  bitrate?: number;
  tempo: number;
  rating: number;
  comment: string;
  filePath: string;
  fileName: string;
  trackNumber?: number;
  discNumber?: number;
  sampleRate?: number;
  sampleDepth?: number;
  playCount?: number;
  year?: number;
  mixName?: string;
  autoloadHotcues?: boolean;
  kuvoPublic?: boolean;
  fileSize?: number;
  analyzePath?: string;
  releaseDate?: string;
  analyzeDate?: Date;
  dateAdded?: Date;

  /**
   * Embedded beat grid information
   */
  beatGrid: BeatGrid | null;

  /**
   * Embedded cue and loop information
   */
  cueAndLoops: CueAndLoop[] | null;

  /**
   * Embedded HD Waveform information
   */
  waveformHd: WaveformHD | null;
} & (withFKs extends EntityFK.WithFKs ? TrackFks : TrackRelations);
