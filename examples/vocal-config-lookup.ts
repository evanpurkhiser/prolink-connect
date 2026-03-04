/**
 * Example: Vocal Detection Configuration Lookup
 *
 * Reads the local rekordbox master.db, finds a specific track in a playlist,
 * and displays its vocal detection configuration (PWVC) from the .2EX
 * analysis file.
 *
 * Usage:
 *   npx ts-node examples/vocal-config-lookup.ts
 */

import Blowfish from '../../rekordbox-connect/node_modules/egoroof-blowfish';
import Database from 'better-sqlite3-multiple-ciphers';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PLAYLIST_NAME = 'Melodic Vox';
const TRACK_TITLE = 'Walking On A Dream (BLOND:ISH Extended Remix)';

// Local paths
const RB_ROOT = path.join(os.homedir(), 'Library', 'Pioneer', 'rekordbox');
const SHARE_ROOT = path.join(RB_ROOT, 'share');
const OPTIONS_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Pioneer',
  'rekordboxAgent',
  'storage',
  'options.json'
);

// ANLZ section tag (big-endian fourcc)
const PWVC_TAG = 0x50575643; // "PWVC"

// ============================================================================
// Open master.db using password from options.json
// ============================================================================

function openMasterDb(): Database.Database {
  const options = JSON.parse(fs.readFileSync(OPTIONS_PATH, 'utf8'));

  const dbPathOpt = options.options.find((o: string[]) => o[0] === 'db-path');
  const dpOpt = options.options.find((o: string[]) => o[0] === 'dp');
  if (!dbPathOpt || !dpOpt) throw new Error('Missing db-path or dp in options.json');

  const bf = new Blowfish('ZOwUlUZYqe9Rdm6j', Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5);
  const password = bf.decode(Buffer.from(dpOpt[1], 'base64'), Blowfish.TYPE.STRING).trim();

  const dbPath = dbPathOpt[1];
  console.log(`Opening database: ${dbPath}\n`);

  const db = new Database(dbPath, {readonly: true});
  db.pragma('cipher = sqlcipher');
  db.pragma('legacy = 4');
  db.pragma(`key = '${password}'`);

  return db;
}

// ============================================================================
// Parse PWVC from .2EX binary
// ============================================================================

interface VocalConfig {
  thresholdLow: number;
  thresholdMid: number;
  thresholdHigh: number;
}

function parseVocalConfigFrom2EX(filePath: string): VocalConfig | null {
  const buf = fs.readFileSync(filePath);
  // Read actual header length from bytes 4-7 (not always 12)
  const headerLen = buf.readUInt32BE(4);
  let offset = headerLen;

  while (offset + 12 <= buf.length) {
    const fourcc = buf.readUInt32BE(offset);
    const lenTag = buf.readUInt32BE(offset + 8);

    if (fourcc === PWVC_TAG) {
      const body = offset + 12;
      return {
        thresholdLow: buf.readUInt16BE(body + 6),
        thresholdMid: buf.readUInt16BE(body + 8),
        thresholdHigh: buf.readUInt16BE(body + 10),
      };
    }

    offset += lenTag;
  }

  return null;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const db = openMasterDb();

  try {
    // Load all playlists and find the target by name
    const allPlaylists = db
      .prepare('SELECT ID, Name, Attribute, ParentID FROM djmdPlaylist')
      .all() as any[];

    const playlist = allPlaylists.find(
      (p: any) => p.Name === PLAYLIST_NAME && p.Attribute !== 1
    );
    if (!playlist) {
      console.error(`Playlist "${PLAYLIST_NAME}" not found`);
      process.exit(1);
    }
    console.log(`Found playlist "${PLAYLIST_NAME}" (id: ${playlist.ID})`);

    // Get tracks in the playlist
    const trackRows = db
      .prepare(
        `SELECT
           c.ID, c.Title, c.BPM, c.AnalysisDataPath,
           a.Name as artistName,
           k.ScaleName as keyName
         FROM djmdSongPlaylist sp
         JOIN djmdContent c ON c.ID = sp.ContentID
         LEFT JOIN djmdArtist a ON a.ID = c.ArtistID
         LEFT JOIN djmdKey k ON k.ID = c.KeyID
         WHERE sp.PlaylistID = @playlistId
         ORDER BY sp.TrackNo`
      )
      .all({playlistId: playlist.ID}) as any[];

    console.log(`Playlist has ${trackRows.length} tracks\n`);

    // Find target track
    const row = trackRows.find((r: any) => r.Title === TRACK_TITLE);
    if (!row) {
      console.error(`Track "${TRACK_TITLE}" not found in playlist`);
      console.log('\nAvailable tracks:');
      for (const r of trackRows) {
        console.log(`  - ${r.Title}`);
      }
      process.exit(1);
    }

    // AnalysisDataPath is like /PIONEER/USBANLZ/.../ANLZ0000.DAT
    // Strip .DAT and append .2EX
    const analyzePath = row.AnalysisDataPath?.replace(/\.DAT$/, '') ?? null;

    console.log(`Track: ${row.artistName ?? 'Unknown'} - ${row.Title}`);
    console.log(`  BPM: ${row.BPM ? row.BPM / 100 : 'unknown'}`);
    console.log(`  Key: ${row.keyName ?? 'unknown'}`);
    console.log(`  Analyze path: ${analyzePath}`);

    if (!analyzePath) {
      console.error('\nTrack has no analysis path');
      process.exit(1);
    }

    // Read .2EX file from the share directory
    const twoxPath = path.join(SHARE_ROOT, `${analyzePath}.2EX`);
    console.log(`\nLoading: ${twoxPath}`);

    if (!fs.existsSync(twoxPath)) {
      console.error(`.2EX file not found at: ${twoxPath}`);
      process.exit(1);
    }

    const vc = parseVocalConfigFrom2EX(twoxPath);
    if (!vc) {
      console.log('No vocal detection configuration (PWVC) found in .2EX file');
      return;
    }

    console.log('\n========================================');
    console.log('  Vocal Detection Configuration (PWVC)');
    console.log('========================================');
    console.log(`  Threshold Low:  ${vc.thresholdLow}`);
    console.log(`  Threshold Mid:  ${vc.thresholdMid}`);
    console.log(`  Threshold High: ${vc.thresholdHigh}`);

    console.log('\n  Normalized (÷ 65535):');
    console.log(`  Low:  ${(vc.thresholdLow / 65535).toFixed(4)}`);
    console.log(`  Mid:  ${(vc.thresholdMid / 65535).toFixed(4)}`);
    console.log(`  High: ${(vc.thresholdHigh / 65535).toFixed(4)}`);
  } finally {
    db.close();
  }
}

main();
