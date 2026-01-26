import {Album, Artist, Color, Genre, Key, Label} from 'src/entities';
import RekordboxPdb from 'src/localdb/kaitai/rekordbox_pdb.ksy';
import {Table} from 'src/localdb/orm';

import {
  createArtworkEntry,
  createPlaylist,
  createPlaylistEntry,
  createTrack,
  makeIdNameHydrator,
} from './entity-creators';

const {PageType} = RekordboxPdb;

/**
 * Maps rekordbox pdb table types to orm table names.
 */
export const pdbTables: Record<number, Table> = {
  [PageType.TRACKS]: Table.Track,
  [PageType.ARTISTS]: Table.Artist,
  [PageType.GENRES]: Table.Genre,
  [PageType.ALBUMS]: Table.Album,
  [PageType.LABELS]: Table.Label,
  [PageType.COLORS]: Table.Color,
  [PageType.KEYS]: Table.Key,
  [PageType.ARTWORK]: Table.Artwork,
  [PageType.PLAYLIST_TREE]: Table.Playlist,
  [PageType.PLAYLIST_ENTRIES]: Table.PlaylistEntry,
};

/**
 * Maps rekordbox pdb table types to functions that create entity objects for
 * the passed pdb row.
 */
export const pdbEntityCreators: Record<number, (row: any) => any> = {
  [PageType.TRACKS]: createTrack,
  [PageType.ARTISTS]: makeIdNameHydrator<Artist>(),
  [PageType.GENRES]: makeIdNameHydrator<Genre>(),
  [PageType.ALBUMS]: makeIdNameHydrator<Album>(),
  [PageType.LABELS]: makeIdNameHydrator<Label>(),
  [PageType.COLORS]: makeIdNameHydrator<Color>(),
  [PageType.KEYS]: makeIdNameHydrator<Key>(),
  [PageType.ARTWORK]: createArtworkEntry,
  [PageType.PLAYLIST_TREE]: createPlaylist,
  [PageType.PLAYLIST_ENTRIES]: createPlaylistEntry,

  // TODO: Register PageType.HISTORY
};
