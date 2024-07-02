import sqlite3 from 'better-sqlite3';
import {camelCase, mapKeys, mapValues, partition, snakeCase} from 'lodash';

import {EntityFK, Playlist, PlaylistEntry, Track} from 'src/entities';

import {generateSchema} from './schema';

/**
 * Table names available
 */
export enum Table {
  Artist = 'artist',
  Album = 'album',
  Genre = 'genre',
  Color = 'color',
  Label = 'label',
  Key = 'key',
  Artwork = 'artwork',
  Playlist = 'playlist',
  PlaylistEntry = 'playlist_entry',
  Track = 'track',
}

const trackRelations = [
  'artwork',
  'artist',
  'originalArtist',
  'remixer',
  'composer',
  'album',
  'label',
  'genre',
  'color',
  'key',
];

const trackRelationTableMap: Record<string, string> = {
  originalArtist: 'artist',
  remixer: 'artist',
  composer: 'artist',
};

/**
 * Object Relation Mapper as an abstraction ontop of a local database
 * connection.
 *
 * May be used to populate a metadata database and query objects.
 */
export class MetadataORM {
  #conn: sqlite3.Database;

  constructor() {
    this.#conn = sqlite3(':memory:');
    this.#conn.exec(generateSchema());
  }

  close() {
    this.#conn.close();
  }

  /**
   * Insert a entity object into the database.
   */
  insertEntity(table: Table, object: Record<string, any>) {
    const fields = Object.entries<any>(object);

    const slots = fields.map(f => `:${f[0]}`).join(', ');
    const columns = fields.map(f => snakeCase(f[0])).join(', ');

    const stmt = this.#conn.prepare(
      `insert into ${table} (${columns}) values (${slots})`
    );

    // Translate date and booleans
    const data = mapValues(object, value =>
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'boolean'
        ? Number(value)
        : value
    );

    stmt.run(data);
  }

  /**
   * Locate a track by ID in the database
   */
  findTrack(id: number): Track {
    const row: Record<string, any> = this.#conn
      .prepare(`select * from ${Table.Track} where id = ?`)
      .get(id);

    // Map row columns to camel case compatibility
    const trackRow = mapKeys(row, (_, k) => camelCase(k)) as Track<EntityFK.WithFKs>;

    trackRow.beatGrid = null;
    trackRow.cueAndLoops = null;
    trackRow.waveformHd = null;

    // Explicitly restore dates and booleans
    trackRow.autoloadHotcues = !!trackRow.autoloadHotcues;
    trackRow.kuvoPublic = !!trackRow.kuvoPublic;

    // Explicitly restore date objects
    trackRow.analyzeDate = new Date(trackRow.analyzeDate as any);
    trackRow.dateAdded = new Date(trackRow.dateAdded as any);

    // Query all track relationships
    const track = trackRow as any;

    for (const relation of trackRelations) {
      const fkName = `${relation}Id`;

      const fk = track[fkName];
      const table = snakeCase(trackRelationTableMap[relation] ?? relation);

      // Swap fk for relation key
      delete track[fkName];
      track[relation] = null;

      if (fk === null) {
        continue;
      }

      const relationItem: Record<string, any> = this.#conn
        .prepare(`select * from ${table} where id = ?`)
        .get(fk);

      track[relation] = relationItem;
    }

    return track as Track;
  }

  /**
   * Query for a list of {folders, playlists, tracks} given a playlist ID. If
   * no ID is provided the root list is queried.
   *
   * Note that when tracks are returned there will be no folders or playslists.
   * But the API here is simpler to assume there could be.
   *
   * Tracks are returned in the order they are placed on the playlist.
   */
  findPlaylist(playlistId?: number) {
    const parentCondition = playlistId === undefined ? 'parent_id is ?' : 'parent_id = ?';

    // Lookup playlists / folders for this playlist ID
    const playlistRows: Array<Record<string, any>> = this.#conn
      .prepare(`select * from ${Table.Playlist} where ${parentCondition}`)
      .all(playlistId);

    const [folders, playlists] = partition(
      playlistRows.map(row => mapKeys(row, (_, k) => camelCase(k)) as Playlist),
      p => p.isFolder
    );

    const entryRows: Array<Record<string, any>> = this.#conn
      .prepare(`select * from ${Table.PlaylistEntry} where playlist_id = ?`)
      .all(playlistId);

    const trackEntries = entryRows.map(
      row => mapKeys(row, (_, k) => camelCase(k)) as PlaylistEntry<EntityFK.WithFKs>
    );

    return {folders, playlists, trackEntries};
  }
}
