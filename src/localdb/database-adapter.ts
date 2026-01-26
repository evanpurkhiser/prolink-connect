/**
 * Common interface for database adapters.
 *
 * Both MetadataORM (for PDB files) and OneLibraryAdapter (for exportLibrary.db)
 * implement this interface, allowing LocalDatabase to use either transparently.
 */

import {EntityFK, Playlist, PlaylistEntry, Track} from 'src/entities';

/**
 * Database format preference for loading rekordbox databases.
 *
 * - 'auto': Try OneLibrary first (rekordbox 7.x+), fall back to PDB (rekordbox 6.x)
 * - 'oneLibrary': Only use OneLibrary format (exportLibrary.db)
 * - 'pdb': Only use PDB format (export.pdb)
 */
export type DatabasePreference = 'auto' | 'oneLibrary' | 'pdb';

/**
 * Result of a playlist query
 */
export interface PlaylistQueryResult {
  folders: Playlist[];
  playlists: Playlist[];
  trackEntries: PlaylistEntry<EntityFK.WithFKs>[];
}

/**
 * Database type identifier
 */
export type DatabaseType = 'oneLibrary' | 'pdb';

/**
 * Common interface for database adapters
 */
export interface DatabaseAdapter {
  /**
   * The type of database (oneLibrary or pdb)
   */
  readonly type: DatabaseType;

  /**
   * Find a track by ID
   */
  findTrack(id: number): Track | null;

  /**
   * Query for a list of {folders, playlists, tracks} given a playlist ID.
   * If no ID is provided the root list is queried.
   */
  findPlaylist(playlistId?: number): PlaylistQueryResult;

  /**
   * Close the database connection
   */
  close(): void;
}
