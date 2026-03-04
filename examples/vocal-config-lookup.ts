/**
 * Example: Vocal Detection Configuration Lookup
 *
 * Reads the local rekordbox OneLibrary database, finds a specific track
 * in a playlist, and displays its vocal detection configuration (PWVC)
 * from the .2EX analysis file.
 *
 * Usage:
 *   npx ts-node examples/vocal-config-lookup.ts <usb-root>
 *
 * Example:
 *   npx ts-node examples/vocal-config-lookup.ts /Volumes/MYUSB
 */

import * as fs from 'fs';
import * as path from 'path';

import {OneLibraryAdapter} from 'src/localdb/onelibrary';
import {loadAnlz} from 'src/localdb/rekordbox';

const PLAYLIST_NAME = 'Melodic Vox';
const TRACK_TITLE = 'Walking On A Dream (BLOND:ISH Extended Remix)';

async function main() {
  const usbRoot = process.argv[2];
  if (!usbRoot) {
    console.error('Usage: npx ts-node examples/vocal-config-lookup.ts <usb-root>');
    console.error('  <usb-root>  Path to the USB drive root (e.g. /Volumes/MYUSB)');
    process.exit(1);
  }

  // Find the exportLibrary.db on the USB
  const dbPath = path.join(usbRoot, 'PIONEER', 'rekordbox', 'exportLibrary.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at: ${dbPath}`);
    process.exit(1);
  }

  console.log(`Opening database: ${dbPath}\n`);
  const db = new OneLibraryAdapter(dbPath);

  try {
    // Find the "Melodic Vox" playlist by walking the playlist tree
    const playlistId = findPlaylistByName(db, PLAYLIST_NAME);
    if (playlistId === null) {
      console.error(`Playlist "${PLAYLIST_NAME}" not found`);
      process.exit(1);
    }
    console.log(`Found playlist "${PLAYLIST_NAME}" (id: ${playlistId})`);

    // Get track IDs from the playlist
    const trackIds = db.findPlaylistContents(playlistId);
    console.log(`Playlist has ${trackIds.length} tracks\n`);

    // Find the target track
    const track = trackIds
      .map(id => db.findTrack(id))
      .find(t => t?.title === TRACK_TITLE);

    if (!track) {
      console.error(`Track "${TRACK_TITLE}" not found in playlist`);
      console.log('\nAvailable tracks:');
      for (const id of trackIds) {
        const t = db.findTrack(id);
        if (t) console.log(`  - ${t.title}`);
      }
      process.exit(1);
    }

    console.log(`Track: ${track.artist?.name} - ${track.title}`);
    console.log(`  BPM: ${track.tempo}`);
    console.log(`  Key: ${track.key?.name ?? 'unknown'}`);
    console.log(`  Analyze path: ${track.analyzePath}`);

    if (!track.analyzePath) {
      console.error('\nTrack has no analysis path');
      process.exit(1);
    }

    // Build a resolver that reads ANLZ files from the USB filesystem
    const anlzResolver = async (anlzPath: string) => {
      const fullPath = path.join(usbRoot, anlzPath);
      return fs.readFileSync(fullPath);
    };

    // Load the .2EX analysis file
    console.log(`\nLoading .2EX analysis data...`);
    const anlz2ex = await loadAnlz(track, '2EX', anlzResolver);

    if (!anlz2ex.vocalConfig) {
      console.log('No vocal detection configuration found in .2EX file');
      return;
    }

    const vc = anlz2ex.vocalConfig;
    console.log('\n========================================');
    console.log('  Vocal Detection Configuration (PWVC)');
    console.log('========================================');
    console.log(`  Threshold Low:  ${vc.thresholdLow}`);
    console.log(`  Threshold Mid:  ${vc.thresholdMid}`);
    console.log(`  Threshold High: ${vc.thresholdHigh}`);

    // Show normalized values (0-1 range used by the vocal boundary detector)
    console.log('\n  Normalized (÷ 65535):');
    console.log(`  Low:  ${(vc.thresholdLow / 65535).toFixed(4)}`);
    console.log(`  Mid:  ${(vc.thresholdMid / 65535).toFixed(4)}`);
    console.log(`  High: ${(vc.thresholdHigh / 65535).toFixed(4)}`);

    // Show 3-band waveform info if available
    if (anlz2ex.waveform3BandPreview) {
      console.log(`\n  3-Band Preview: ${anlz2ex.waveform3BandPreview.numEntries} entries`);
    }
    if (anlz2ex.waveform3BandDetail) {
      console.log(
        `  3-Band Detail:  ${anlz2ex.waveform3BandDetail.numEntries} entries ` +
          `(${anlz2ex.waveform3BandDetail.samplesPerBeat} samples/beat)`
      );
    }
  } finally {
    db.close();
  }
}

/**
 * Walk the playlist tree to find a playlist by name.
 */
function findPlaylistByName(
  db: OneLibraryAdapter,
  name: string,
  parentId?: number
): number | null {
  const {folders, playlists} = db.findPlaylist(parentId);

  // Check playlists at this level
  for (const pl of playlists) {
    if (pl.name === name) {
      return pl.id;
    }
  }

  // Recurse into folders
  for (const folder of folders) {
    const found = findPlaylistByName(db, name, folder.id);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
