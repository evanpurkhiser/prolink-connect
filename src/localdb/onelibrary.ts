/**
 * OneLibrary Database Adapter
 *
 * Provides an interface for reading the OneLibrary (exportLibrary.db) SQLite database
 * used by modern rekordbox versions and Pioneer DJ devices.
 *
 * The database is encrypted with SQLCipher 4. The encryption key is derived from
 * a hardcoded obfuscated blob.
 */

import Database from 'better-sqlite3-multiple-ciphers';

import * as zlib from 'zlib';

import {
  Album,
  Artist,
  Artwork,
  Color,
  EntityFK,
  Genre,
  Key,
  Label,
  Playlist,
  PlaylistEntry,
  Track,
} from 'src/entities';
import {CueAndLoop, CueColor, HotcueButton} from 'src/types';

import {
  ArtistRow,
  CategoryRow,
  ContentRow,
  CueRow,
  HistoryRow,
  HotCueBankListRow,
  MenuItemRow,
  MyTagAttribute,
  MyTagRow,
  PlaylistAttribute,
  PlaylistContentRow,
  PlaylistRow,
  PropertyRow,
  SortRow,
} from './onelibrary-schema';

// ============================================================================
// Encryption Key Derivation
// ============================================================================

/**
 * The obfuscated encryption key blob from pyrekordbox
 */
const BLOB = Buffer.from(
  'PN_1dH8$oLJY)16j_RvM6qphWw`476>;C1cWmI#se(PG`j}~xAjlufj?`#0i{;=glh(SkW)y0>n?YEiD`l%t(',
  'ascii'
);

/**
 * XOR key used for deobfuscation
 */
const BLOB_KEY = Buffer.from('657f48f84c437cc1', 'ascii');

/**
 * Base85 (RFC 1924) decode
 */
function base85Decode(input: Buffer): Buffer {
  const alphabet =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';

  const charToValue = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) {
    charToValue.set(alphabet[i], i);
  }

  const inputStr = input.toString('ascii');
  const result: number[] = [];

  for (let i = 0; i < inputStr.length; i += 5) {
    const chunk = inputStr.slice(i, i + 5);
    let value = 0;

    for (const char of chunk) {
      const v = charToValue.get(char);
      if (v === undefined) {
        throw new Error(`Invalid base85 character: ${char}`);
      }
      value = value * 85 + v;
    }

    const bytes = [
      (value >> 24) & 0xff,
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ];

    const numBytes = chunk.length === 5 ? 4 : chunk.length - 1;
    result.push(...bytes.slice(0, numBytes));
  }

  return Buffer.from(result);
}

/**
 * Deobfuscate the blob to get the encryption key
 */
function deobfuscate(blob: Buffer): string {
  const decoded = base85Decode(blob);

  const xored = Buffer.alloc(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    xored[i] = decoded[i] ^ BLOB_KEY[i % BLOB_KEY.length];
  }

  const decompressed = zlib.inflateSync(xored);
  return decompressed.toString('utf-8');
}

/**
 * Get the SQLCipher encryption key for OneLibrary databases
 */
export function getEncryptionKey(): string {
  const key = deobfuscate(BLOB);
  if (!key.startsWith('r8gd')) {
    throw new Error('Invalid encryption key derived');
  }
  return key;
}

// ============================================================================
// Database Connection
// ============================================================================

/**
 * Open a OneLibrary database with SQLCipher decryption
 */
export function openOneLibraryDb(dbPath: string): Database.Database {
  const key = getEncryptionKey();

  const db = new Database(dbPath, {readonly: true});
  db.pragma('cipher = sqlcipher');
  db.pragma('legacy = 4');
  db.pragma(`key = '${key}'`);

  return db;
}

// ============================================================================
// OneLibrary Adapter
// ============================================================================

/**
 * Adapter for OneLibrary database that matches the ORM interface.
 * Queries the SQLite file directly instead of hydrating into memory.
 */
export class OneLibraryAdapter {
  #db: Database.Database;
  #stmtCache = new Map<string, Database.Statement>();

  constructor(dbPath: string) {
    this.#db = openOneLibraryDb(dbPath);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.#stmtCache.clear();
    this.#db.close();
  }

  /**
   * Get or create a prepared statement (cached)
   */
  #getStmt(sql: string): Database.Statement {
    let stmt = this.#stmtCache.get(sql);
    if (!stmt) {
      stmt = this.#db.prepare(sql);
      this.#stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  // ==========================================================================
  // Track Queries
  // ==========================================================================

  /**
   * Find a track by ID
   */
  findTrack(id: number): Track | null {
    const row = this.#getStmt(
      `
      SELECT c.*,
             a.name as artistName,
             al.name as albumName,
             g.name as genreName,
             k.name as keyName,
             col.name as colorName,
             lbl.name as labelName,
             img.path as artworkPath,
             remix.name as remixerName,
             orig.name as originalArtistName,
             comp.name as composerName
      FROM content c
      LEFT JOIN artist a ON c.artist_id_artist = a.artist_id
      LEFT JOIN album al ON c.album_id = al.album_id
      LEFT JOIN genre g ON c.genre_id = g.genre_id
      LEFT JOIN key k ON c.key_id = k.key_id
      LEFT JOIN color col ON c.color_id = col.color_id
      LEFT JOIN label lbl ON c.label_id = lbl.label_id
      LEFT JOIN image img ON c.image_id = img.image_id
      LEFT JOIN artist remix ON c.artist_id_remixer = remix.artist_id
      LEFT JOIN artist orig ON c.artist_id_originalArtist = orig.artist_id
      LEFT JOIN artist comp ON c.artist_id_composer = comp.artist_id
      WHERE c.content_id = ?
    `
    ).get(id) as (ContentRow & Record<string, unknown>) | undefined;

    if (!row) {
      return null;
    }

    return this.#contentToTrack(row);
  }

  /**
   * Find all tracks in the database
   */
  findAllTracks(): Track[] {
    const rows = this.#getStmt(
      `
      SELECT c.*,
             a.name as artistName,
             al.name as albumName,
             g.name as genreName,
             k.name as keyName,
             col.name as colorName,
             lbl.name as labelName,
             img.path as artworkPath,
             remix.name as remixerName,
             orig.name as originalArtistName,
             comp.name as composerName
      FROM content c
      LEFT JOIN artist a ON c.artist_id_artist = a.artist_id
      LEFT JOIN album al ON c.album_id = al.album_id
      LEFT JOIN genre g ON c.genre_id = g.genre_id
      LEFT JOIN key k ON c.key_id = k.key_id
      LEFT JOIN color col ON c.color_id = col.color_id
      LEFT JOIN label lbl ON c.label_id = lbl.label_id
      LEFT JOIN image img ON c.image_id = img.image_id
      LEFT JOIN artist remix ON c.artist_id_remixer = remix.artist_id
      LEFT JOIN artist orig ON c.artist_id_originalArtist = orig.artist_id
      LEFT JOIN artist comp ON c.artist_id_composer = comp.artist_id
    `
    ).all() as Array<ContentRow & Record<string, unknown>>;

    return rows.map(row => this.#contentToTrack(row));
  }

  /**
   * Convert a content row to a Track entity
   */
  #contentToTrack(row: ContentRow & Record<string, unknown>): Track {
    const track: Track = {
      id: row.content_id,
      title: row.title ?? '',
      duration: row.length ? row.length / 1000 : 0, // ms to seconds
      bitrate: row.bitrate ?? undefined,
      tempo: row.bpmx100 ? row.bpmx100 / 100 : 0,
      rating: row.rating ?? 0,
      comment: row.djComment ?? '',
      filePath: row.path ?? '',
      fileName: row.fileName ?? '',
      trackNumber: row.trackNo ?? undefined,
      discNumber: row.discNo ?? undefined,
      sampleRate: row.samplingRate ?? undefined,
      sampleDepth: row.bitDepth ?? undefined,
      playCount: row.djPlayCount ?? undefined,
      year: row.releaseYear ?? undefined,
      mixName: row.subtitle ?? undefined,
      autoloadHotcues: !!row.isHotCueAutoLoadOn,
      kuvoPublic: !!row.isKuvoDeliverStatusOn,
      fileSize: row.fileSize ?? undefined,
      analyzePath: row.analysisDataFilePath ?? undefined,
      releaseDate: row.releaseDate ?? undefined,
      dateAdded: row.dateAdded ? new Date(row.dateAdded) : undefined,

      beatGrid: null,
      cueAndLoops: null,
      waveformHd: null,

      artwork: row.image_id
        ? {id: row.image_id, path: (row.artworkPath as string) ?? undefined}
        : null,
      artist: row.artist_id_artist
        ? {id: row.artist_id_artist, name: (row.artistName as string) ?? ''}
        : null,
      originalArtist: row.artist_id_originalArtist
        ? {
            id: row.artist_id_originalArtist,
            name: (row.originalArtistName as string) ?? '',
          }
        : null,
      remixer: row.artist_id_remixer
        ? {id: row.artist_id_remixer, name: (row.remixerName as string) ?? ''}
        : null,
      composer: row.artist_id_composer
        ? {id: row.artist_id_composer, name: (row.composerName as string) ?? ''}
        : null,
      album: row.album_id
        ? {id: row.album_id, name: (row.albumName as string) ?? ''}
        : null,
      label: row.label_id
        ? {id: row.label_id, name: (row.labelName as string) ?? ''}
        : null,
      genre: row.genre_id
        ? {id: row.genre_id, name: (row.genreName as string) ?? ''}
        : null,
      color: row.color_id
        ? {id: row.color_id, name: (row.colorName as string) ?? ''}
        : null,
      key: row.key_id ? {id: row.key_id, name: (row.keyName as string) ?? ''} : null,
    };

    return track;
  }

  // ==========================================================================
  // Cue Queries
  // ==========================================================================

  /**
   * Find cue points for a track
   */
  findCues(trackId: number): CueAndLoop[] {
    const rows = this.#getStmt(
      `
      SELECT * FROM cue WHERE content_id = ?
    `
    ).all(trackId) as CueRow[];

    return rows.map(row => this.#cueToCueAndLoop(row));
  }

  /**
   * Convert a cue row to a CueAndLoop entity
   */
  #cueToCueAndLoop(row: CueRow): CueAndLoop {
    const offset = row.inUsec ? row.inUsec / 1000 : 0; // microseconds to ms
    const outOffset = row.outUsec ?? null;
    const isLoop = outOffset !== null && outOffset > 0;
    const length = isLoop ? (outOffset - (row.inUsec ?? 0)) / 1000 : 0;

    // Determine if this is a hot cue (kind value mapping may vary)
    // Based on observation: kind 0 = memory cue, kind >= 1 may be hot cue
    const isHotCue = (row.kind ?? 0) >= 1 && (row.kind ?? 0) <= 8;
    const button = isHotCue ? ((row.kind ?? 0) as HotcueButton) : undefined;

    const label = row.cueComment ?? undefined;
    const color = row.colorTableIndex as CueColor | undefined;

    if (isLoop && isHotCue) {
      return {
        type: 'hot_loop',
        offset,
        length,
        button: button!,
        label,
        color,
      };
    }
    if (isLoop) {
      return {
        type: 'loop',
        offset,
        length,
        label,
        color,
      };
    }
    if (isHotCue) {
      return {
        type: 'hot_cue',
        offset,
        button: button!,
        label,
        color,
      };
    }
    return {
      type: 'cue_point',
      offset,
      label,
      color,
    };
  }

  // ==========================================================================
  // Playlist Queries
  // ==========================================================================

  /**
   * Find a playlist by ID
   */
  findPlaylistById(playlistId: number): Playlist | null {
    const row = this.#getStmt(
      `
      SELECT * FROM playlist WHERE playlist_id = ?
    `
    ).get(playlistId) as PlaylistRow | undefined;

    return row ? this.#playlistRowToPlaylist(row) : null;
  }

  /**
   * Query for a list of {folders, playlists, tracks} given a playlist ID.
   * If no ID is provided the root list is queried.
   */
  findPlaylist(playlistId?: number) {
    const parentCondition =
      playlistId === undefined ? 'playlist_id_parent IS NULL' : 'playlist_id_parent = ?';

    // Lookup playlists / folders for this playlist ID
    const playlistRows = (
      playlistId === undefined
        ? this.#getStmt(`SELECT * FROM playlist WHERE ${parentCondition}`).all()
        : this.#getStmt(`SELECT * FROM playlist WHERE ${parentCondition}`).all(playlistId)
    ) as PlaylistRow[];

    const folders: Playlist[] = [];
    const playlists: Playlist[] = [];

    for (const row of playlistRows) {
      const playlist = this.#playlistRowToPlaylist(row);
      if (playlist.isFolder) {
        folders.push(playlist);
      } else {
        playlists.push(playlist);
      }
    }

    // Get track entries for this playlist
    const entryRows =
      playlistId === undefined
        ? []
        : (this.#getStmt(
            `
          SELECT * FROM playlist_content WHERE playlist_id = ? ORDER BY sequenceNo
        `
          ).all(playlistId) as PlaylistContentRow[]);

    const trackEntries: Array<PlaylistEntry<EntityFK.WithFKs>> = entryRows.map(
      (row, index) => ({
        id: index, // playlist_content doesn't have a unique ID, use index
        sortIndex: row.sequenceNo,
        playlistId: row.playlist_id,
        trackId: row.content_id,
      })
    );

    return {folders, playlists, trackEntries};
  }

  /**
   * Get track IDs for a playlist in order
   */
  findPlaylistContents(playlistId: number): number[] {
    const rows = this.#getStmt(
      `
      SELECT content_id FROM playlist_content
      WHERE playlist_id = ? ORDER BY sequenceNo
    `
    ).all(playlistId) as Array<{content_id: number}>;

    return rows.map(r => r.content_id);
  }

  /**
   * Convert a playlist row to a Playlist entity
   */
  #playlistRowToPlaylist(row: PlaylistRow): Playlist {
    return {
      id: row.playlist_id,
      name: row.name ?? '',
      isFolder: row.attribute === PlaylistAttribute.FOLDER,
      parentId: row.playlist_id_parent,
    };
  }

  // ==========================================================================
  // Reference Table Queries
  // ==========================================================================

  findArtist(artistId: number): Artist | null {
    const row = this.#getStmt(
      `
      SELECT * FROM artist WHERE artist_id = ?
    `
    ).get(artistId) as ArtistRow | undefined;

    return row ? {id: row.artist_id, name: row.name ?? ''} : null;
  }

  findAlbum(albumId: number): Album | null {
    const row = this.#getStmt(
      `
      SELECT * FROM album WHERE album_id = ?
    `
    ).get(albumId) as {album_id: number; name: string | null} | undefined;

    return row ? {id: row.album_id, name: row.name ?? ''} : null;
  }

  findGenre(genreId: number): Genre | null {
    const row = this.#getStmt(
      `
      SELECT * FROM genre WHERE genre_id = ?
    `
    ).get(genreId) as {genre_id: number; name: string | null} | undefined;

    return row ? {id: row.genre_id, name: row.name ?? ''} : null;
  }

  findKey(keyId: number): Key | null {
    const row = this.#getStmt(
      `
      SELECT * FROM key WHERE key_id = ?
    `
    ).get(keyId) as {key_id: number; name: string | null} | undefined;

    return row ? {id: row.key_id, name: row.name ?? ''} : null;
  }

  findColor(colorId: number): Color | null {
    const row = this.#getStmt(
      `
      SELECT * FROM color WHERE color_id = ?
    `
    ).get(colorId) as {color_id: number; name: string | null} | undefined;

    return row ? {id: row.color_id, name: row.name ?? ''} : null;
  }

  findLabel(labelId: number): Label | null {
    const row = this.#getStmt(
      `
      SELECT * FROM label WHERE label_id = ?
    `
    ).get(labelId) as {label_id: number; name: string | null} | undefined;

    return row ? {id: row.label_id, name: row.name ?? ''} : null;
  }

  findArtwork(imageId: number): Artwork | null {
    const row = this.#getStmt(
      `
      SELECT * FROM image WHERE image_id = ?
    `
    ).get(imageId) as {image_id: number; path: string | null} | undefined;

    return row ? {id: row.image_id, path: row.path ?? undefined} : null;
  }

  // ==========================================================================
  // MyTag (User Tags) Queries
  // ==========================================================================

  /**
   * Find all root-level MyTags (folders and tags with no parent)
   */
  findMyTags(parentId?: number): {folders: MyTag[]; tags: MyTag[]} {
    const parentCondition =
      parentId === undefined
        ? 'myTag_id_parent IS NULL OR myTag_id_parent = 0'
        : 'myTag_id_parent = ?';

    const rows = (
      parentId === undefined
        ? this.#getStmt(
            `SELECT * FROM myTag WHERE ${parentCondition} ORDER BY sequenceNo`
          ).all()
        : this.#getStmt(
            `SELECT * FROM myTag WHERE ${parentCondition} ORDER BY sequenceNo`
          ).all(parentId)
    ) as MyTagRow[];

    const folders: MyTag[] = [];
    const tags: MyTag[] = [];

    for (const row of rows) {
      const tag = this.#myTagRowToMyTag(row);
      if (tag.isFolder) {
        folders.push(tag);
      } else {
        tags.push(tag);
      }
    }

    return {folders, tags};
  }

  /**
   * Find a MyTag by ID
   */
  findMyTagById(myTagId: number): MyTag | null {
    const row = this.#getStmt(
      `
      SELECT * FROM myTag WHERE myTag_id = ?
    `
    ).get(myTagId) as MyTagRow | undefined;

    return row ? this.#myTagRowToMyTag(row) : null;
  }

  /**
   * Get track IDs for a MyTag
   */
  findMyTagContents(myTagId: number): number[] {
    const rows = this.#getStmt(
      `
      SELECT content_id FROM myTag_content WHERE myTag_id = ?
    `
    ).all(myTagId) as Array<{content_id: number}>;

    return rows.map(r => r.content_id);
  }

  /**
   * Get all MyTags assigned to a track
   */
  findMyTagsForTrack(trackId: number): MyTag[] {
    const rows = this.#getStmt(
      `
      SELECT t.* FROM myTag t
      INNER JOIN myTag_content tc ON t.myTag_id = tc.myTag_id
      WHERE tc.content_id = ?
    `
    ).all(trackId) as MyTagRow[];

    return rows.map(row => this.#myTagRowToMyTag(row));
  }

  #myTagRowToMyTag(row: MyTagRow): MyTag {
    return {
      id: row.myTag_id,
      name: row.name ?? '',
      isFolder: row.attribute === MyTagAttribute.FOLDER,
      parentId: row.myTag_id_parent,
    };
  }

  // ==========================================================================
  // History Queries
  // ==========================================================================

  /**
   * Find all history sessions
   */
  findHistorySessions(): HistorySession[] {
    const rows = this.#getStmt(
      `
      SELECT * FROM history ORDER BY sequenceNo
    `
    ).all() as HistoryRow[];

    return rows.map(row => ({
      id: row.history_id,
      name: row.name ?? '',
      parentId: row.history_id_parent,
    }));
  }

  /**
   * Get track IDs for a history session in order
   */
  findHistoryContents(historyId: number): number[] {
    const rows = this.#getStmt(
      `
      SELECT content_id FROM history_content
      WHERE history_id = ? ORDER BY sequenceNo
    `
    ).all(historyId) as Array<{content_id: number}>;

    return rows.map(r => r.content_id);
  }

  // ==========================================================================
  // Hot Cue Bank Queries
  // ==========================================================================

  /**
   * Find all hot cue bank lists
   */
  findHotCueBankLists(): HotCueBankList[] {
    const rows = this.#getStmt(
      `
      SELECT * FROM hotCueBankList ORDER BY sequenceNo
    `
    ).all() as HotCueBankListRow[];

    return rows.map(row => ({
      id: row.hotCueBankList_id,
      name: row.name ?? '',
      parentId: row.hotCueBankList_id_parent,
    }));
  }

  /**
   * Get cue IDs for a hot cue bank list
   */
  findHotCueBankListCues(bankListId: number): number[] {
    const rows = this.#getStmt(
      `
      SELECT cue_id FROM hotCueBankList_cue
      WHERE hotCueBankList_id = ? ORDER BY sequenceNo
    `
    ).all(bankListId) as Array<{cue_id: number}>;

    return rows.map(r => r.cue_id);
  }

  // ==========================================================================
  // Menu Configuration Queries
  // ==========================================================================

  /**
   * Get all menu items (browse categories)
   */
  findMenuItems(): MenuItem[] {
    const rows = this.#getStmt(
      `
      SELECT * FROM menuItem ORDER BY menuItem_id
    `
    ).all() as MenuItemRow[];

    return rows.map(row => ({
      id: row.menuItem_id,
      kind: row.kind ?? 0,
      name: row.name ?? '',
    }));
  }

  /**
   * Get visible categories with their menu item info
   */
  findVisibleCategories(): Category[] {
    const rows = this.#getStmt(
      `
      SELECT c.*, m.name as menuName, m.kind as menuKind
      FROM category c
      LEFT JOIN menuItem m ON c.menuItem_id = m.menuItem_id
      WHERE c.isVisible = 1
      ORDER BY c.sequenceNo
    `
    ).all() as Array<CategoryRow & {menuName: string | null; menuKind: number | null}>;

    return rows.map(row => ({
      id: row.category_id,
      menuItemId: row.menuItem_id ?? 0,
      name: row.menuName ?? '',
      kind: row.menuKind ?? 0,
      isVisible: !!row.isVisible,
    }));
  }

  /**
   * Get visible sort options
   */
  findVisibleSortOptions(): SortOption[] {
    const rows = this.#getStmt(
      `
      SELECT s.*, m.name as menuName, m.kind as menuKind
      FROM sort s
      LEFT JOIN menuItem m ON s.menuItem_id = m.menuItem_id
      WHERE s.isVisible = 1
      ORDER BY s.sequenceNo
    `
    ).all() as Array<SortRow & {menuName: string | null; menuKind: number | null}>;

    return rows.map(row => ({
      id: row.sort_id,
      menuItemId: row.menuItem_id ?? 0,
      name: row.menuName ?? '',
      kind: row.menuKind ?? 0,
      isVisible: !!row.isVisible,
      isSelectedAsSubColumn: !!row.isSelectedAsSubColumn,
    }));
  }

  // ==========================================================================
  // Device Property Queries
  // ==========================================================================

  /**
   * Get device properties
   */
  getProperty(): DeviceProperty | null {
    const row = this.#getStmt(
      `
      SELECT * FROM property LIMIT 1
    `
    ).get() as PropertyRow | undefined;

    if (!row) {
      return null;
    }

    return {
      deviceName: row.deviceName ?? '',
      dbVersion: row.dbVersion ?? '',
      numberOfContents: row.numberOfContents ?? 0,
      createdDate: row.createdDate ?? '',
      backgroundColorType: row.backGroundColorType ?? 0,
    };
  }
}

// ============================================================================
// Additional Entity Types
// ============================================================================

/**
 * User-created tag (MyTag)
 */
export interface MyTag {
  id: number;
  name: string;
  isFolder: boolean;
  parentId: number | null;
}

/**
 * History session
 */
export interface HistorySession {
  id: number;
  name: string;
  parentId: number | null;
}

/**
 * Hot cue bank list
 */
export interface HotCueBankList {
  id: number;
  name: string;
  parentId: number | null;
}

/**
 * Menu item for browsing
 */
export interface MenuItem {
  id: number;
  kind: number;
  name: string;
}

/**
 * Browse category
 */
export interface Category {
  id: number;
  menuItemId: number;
  name: string;
  kind: number;
  isVisible: boolean;
}

/**
 * Sort option
 */
export interface SortOption {
  id: number;
  menuItemId: number;
  name: string;
  kind: number;
  isVisible: boolean;
  isSelectedAsSubColumn: boolean;
}

/**
 * Device property
 */
export interface DeviceProperty {
  deviceName: string;
  dbVersion: string;
  numberOfContents: number;
  createdDate: string;
  backgroundColorType: number;
}
