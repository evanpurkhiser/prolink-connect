/**
 * Creates a test OneLibrary database for unit testing.
 *
 * This script creates an encrypted SQLite database that matches the exact
 * schema of rekordbox's exportLibrary.db, allowing us to test the
 * OneLibraryAdapter without needing a real CDJ or USB drive.
 *
 * Run with: npx ts-node tests/localdb/fixtures/create-test-db.ts
 */

import Database from 'better-sqlite3-multiple-ciphers';
import * as fs from 'fs';
import * as path from 'path';

// Known key value from getEncryptionKey() - tested in onelibrary.spec.ts
const ONELIBRARY_KEY =
  'r8gddnr4k847830ar6cqzbkk0el6qytmb3trbbx805jm74vez64i5o8fnrqryqls';

const FIXTURE_DIR = path.dirname(__filename);
const DB_PATH = path.join(FIXTURE_DIR, 'test-onelibrary.db');

// Remove existing file
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

// Create encrypted database
const db = new Database(DB_PATH);

db.pragma(`cipher='sqlcipher'`);
db.pragma(`legacy=4`);
db.pragma(`key='${ONELIBRARY_KEY}'`);

// Create all tables matching OneLibrary schema exactly
db.exec(`
  -- ============================================================================
  -- Property table (device info)
  -- ============================================================================
  CREATE TABLE property (
    deviceName TEXT,
    dbVersion TEXT,
    numberOfContents INTEGER,
    createdDate TEXT,
    backGroundColorType INTEGER,
    myTagMasterDBID INTEGER
  );

  INSERT INTO property VALUES ('Test Device', '1.0.0', 5, '2024-01-01 00:00:00', 0, NULL);

  -- ============================================================================
  -- Artist table
  -- ============================================================================
  CREATE TABLE artist (
    artist_id INTEGER PRIMARY KEY,
    name TEXT,
    nameForSearch TEXT
  );

  INSERT INTO artist VALUES (1, 'Test Artist', 'test artist');
  INSERT INTO artist VALUES (2, 'Another Artist', 'another artist');
  INSERT INTO artist VALUES (3, 'Remixer One', 'remixer one');

  -- ============================================================================
  -- Album table
  -- ============================================================================
  CREATE TABLE album (
    album_id INTEGER PRIMARY KEY,
    name TEXT,
    artist_id INTEGER,
    image_id INTEGER,
    isComplation INTEGER,
    nameForSearch TEXT
  );

  INSERT INTO album VALUES (1, 'Test Album', 1, 1, 0, 'test album');
  INSERT INTO album VALUES (2, 'Another Album', 2, NULL, 0, 'another album');

  -- ============================================================================
  -- Genre table
  -- ============================================================================
  CREATE TABLE genre (
    genre_id INTEGER PRIMARY KEY,
    name TEXT
  );

  INSERT INTO genre VALUES (1, 'Electronic');
  INSERT INTO genre VALUES (2, 'House');
  INSERT INTO genre VALUES (3, 'Techno');

  -- ============================================================================
  -- Key table (musical key)
  -- ============================================================================
  CREATE TABLE key (
    key_id INTEGER PRIMARY KEY,
    name TEXT
  );

  INSERT INTO key VALUES (1, 'Am');
  INSERT INTO key VALUES (2, 'C');
  INSERT INTO key VALUES (3, 'Fm');

  -- ============================================================================
  -- Color table
  -- ============================================================================
  CREATE TABLE color (
    color_id INTEGER PRIMARY KEY,
    name TEXT
  );

  INSERT INTO color VALUES (1, 'Pink');
  INSERT INTO color VALUES (2, 'Red');
  INSERT INTO color VALUES (3, 'Orange');
  INSERT INTO color VALUES (4, 'Yellow');
  INSERT INTO color VALUES (5, 'Green');

  -- ============================================================================
  -- Label table
  -- ============================================================================
  CREATE TABLE label (
    label_id INTEGER PRIMARY KEY,
    name TEXT
  );

  INSERT INTO label VALUES (1, 'Test Label');
  INSERT INTO label VALUES (2, 'Another Label');

  -- ============================================================================
  -- Image (artwork) table
  -- ============================================================================
  CREATE TABLE image (
    image_id INTEGER PRIMARY KEY,
    path TEXT
  );

  INSERT INTO image VALUES (1, '/PIONEER/USBANLZ/P001/0001/artwork.jpg');
  INSERT INTO image VALUES (2, '/PIONEER/USBANLZ/P002/0001/artwork.jpg');

  -- ============================================================================
  -- Content (tracks) table - exact schema from onelibrary-schema.ts
  -- ============================================================================
  CREATE TABLE content (
    content_id INTEGER PRIMARY KEY,
    title TEXT,
    titleForSearch TEXT,
    subtitle TEXT,
    bpmx100 INTEGER,
    length INTEGER,
    trackNo INTEGER,
    discNo INTEGER,
    artist_id_artist INTEGER,
    artist_id_remixer INTEGER,
    artist_id_originalArtist INTEGER,
    artist_id_composer INTEGER,
    artist_id_lyricist INTEGER,
    album_id INTEGER,
    genre_id INTEGER,
    label_id INTEGER,
    key_id INTEGER,
    color_id INTEGER,
    image_id INTEGER,
    djComment TEXT,
    rating INTEGER,
    releaseYear INTEGER,
    releaseDate TEXT,
    dateCreated TEXT,
    dateAdded TEXT,
    path TEXT,
    fileName TEXT,
    fileSize INTEGER,
    fileType INTEGER,
    bitrate INTEGER,
    bitDepth INTEGER,
    samplingRate INTEGER,
    isrc TEXT,
    djPlayCount INTEGER,
    isHotCueAutoLoadOn INTEGER,
    isKuvoDeliverStatusOn INTEGER,
    kuvoDeliveryComment TEXT,
    masterDbId INTEGER,
    masterContentId INTEGER,
    analysisDataFilePath TEXT,
    analysedBits INTEGER,
    contentLink INTEGER,
    hasModified INTEGER,
    cueUpdateCount INTEGER,
    analysisDataUpdateCount INTEGER,
    informationUpdateCount INTEGER
  );

  -- Track 1: Full metadata
  INSERT INTO content VALUES (
    1, 'Test Track', 'test track', 'Extended Mix',
    12800, 300000, 1, 1,
    1, 3, NULL, NULL, NULL,
    1, 1, 1, 1, 1, 1,
    'Test comment', 5, 2024, '2024-01-01', '2024-01-01', '2024-01-01',
    '/Music/test.mp3', 'test.mp3', 5000000, 1, 320, 16, 44100, NULL,
    10, 1, 1, NULL, NULL, NULL,
    '/PIONEER/USBANLZ/P001/0001/ANLZ0000', NULL, NULL,
    0, 0, 0, 0
  );

  -- Track 2: Minimal metadata (null relations)
  INSERT INTO content VALUES (
    2, 'Another Track', 'another track', NULL,
    14000, 240000, 2, 1,
    2, NULL, NULL, NULL, NULL,
    2, 2, NULL, 2, 2, NULL,
    NULL, 4, 2023, '2023-06-15', '2023-06-15', '2023-06-15',
    '/Music/another.mp3', 'another.mp3', 4000000, 1, 256, 16, 48000, NULL,
    5, 0, 0, NULL, NULL, NULL,
    '/PIONEER/USBANLZ/P002/0001/ANLZ0000', NULL, NULL,
    0, 0, 0, 0
  );

  -- Track 3: Edge case - no artist, minimal data
  INSERT INTO content VALUES (
    3, 'Unknown Track', 'unknown track', NULL,
    0, 180000, 1, 1,
    NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, 0, NULL, NULL, NULL, '2024-01-15',
    '/Music/unknown.mp3', 'unknown.mp3', 3000000, 1, 128, 16, 44100, NULL,
    0, 0, 0, NULL, NULL, NULL,
    NULL, NULL, NULL,
    0, 0, 0, 0
  );

  -- Track 4 & 5: For playlist/history testing
  INSERT INTO content VALUES (
    4, 'Playlist Track A', 'playlist track a', NULL,
    13000, 210000, 3, 1,
    1, NULL, NULL, NULL, NULL,
    1, 1, 1, 3, 3, 1,
    NULL, 3, 2024, NULL, NULL, '2024-01-10',
    '/Music/playlist_a.mp3', 'playlist_a.mp3', 4500000, 1, 320, 16, 44100, NULL,
    2, 1, 0, NULL, NULL, NULL,
    '/PIONEER/USBANLZ/P003/0001/ANLZ0000', NULL, NULL,
    0, 0, 0, 0
  );

  INSERT INTO content VALUES (
    5, 'Playlist Track B', 'playlist track b', NULL,
    13500, 225000, 4, 1,
    2, NULL, NULL, NULL, NULL,
    2, 2, 2, 1, 4, 2,
    NULL, 4, 2024, NULL, NULL, '2024-01-10',
    '/Music/playlist_b.mp3', 'playlist_b.mp3', 4800000, 1, 320, 16, 44100, NULL,
    3, 1, 0, NULL, NULL, NULL,
    '/PIONEER/USBANLZ/P004/0001/ANLZ0000', NULL, NULL,
    0, 0, 0, 0
  );

  -- ============================================================================
  -- Cue table - exact schema
  -- ============================================================================
  CREATE TABLE cue (
    cue_id INTEGER PRIMARY KEY,
    content_id INTEGER,
    kind INTEGER,
    colorTableIndex INTEGER,
    cueComment TEXT,
    isActiveLoop INTEGER,
    beatLoopNumerator INTEGER,
    beatLoopDenominator INTEGER,
    inUsec INTEGER,
    outUsec INTEGER,
    in150FramePerSec INTEGER,
    out150FramePerSec INTEGER,
    inMpegFrameNumber INTEGER,
    outMpegFrameNumber INTEGER,
    inMpegAbs INTEGER,
    outMpegAbs INTEGER,
    inDecodingStartFramePosition INTEGER,
    outDecodingStartFramePosition INTEGER,
    inFileOffsetInBlock INTEGER,
    OutFileOffsetInBlock INTEGER,
    inNumberOfSampleInBlock INTEGER,
    outNumberOfSampleInBlock INTEGER
  );

  -- Track 1 cues: memory cue, hot cue, loop, hot loop
  INSERT INTO cue VALUES (1, 1, 0, NULL, 'Start', 0, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  INSERT INTO cue VALUES (2, 1, 1, 2, 'Drop', 0, NULL, NULL, 32000000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  INSERT INTO cue VALUES (3, 1, 0, NULL, 'Build', 1, 4, 1, 64000000, 80000000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  INSERT INTO cue VALUES (4, 1, 2, 3, 'Hook', 1, 2, 1, 128000000, 136000000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

  -- Track 4 cues
  INSERT INTO cue VALUES (5, 4, 1, 1, 'Intro', 0, NULL, NULL, 1000000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  INSERT INTO cue VALUES (6, 4, 2, 4, 'Main Loop', 1, 8, 1, 60000000, 90000000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

  -- ============================================================================
  -- Playlist table
  -- ============================================================================
  CREATE TABLE playlist (
    playlist_id INTEGER PRIMARY KEY,
    sequenceNo INTEGER,
    name TEXT,
    image_id INTEGER,
    attribute INTEGER,
    playlist_id_parent INTEGER
  );

  INSERT INTO playlist VALUES (1, 1, 'My Favorites', NULL, 0, NULL);
  INSERT INTO playlist VALUES (2, 2, 'DJ Sets', NULL, 1, NULL);
  INSERT INTO playlist VALUES (3, 1, 'Club Night', NULL, 0, 2);
  INSERT INTO playlist VALUES (4, 2, 'Festival', NULL, 0, 2);
  INSERT INTO playlist VALUES (5, 3, 'Empty Playlist', NULL, 0, NULL);

  -- ============================================================================
  -- Playlist content table
  -- ============================================================================
  CREATE TABLE playlist_content (
    playlist_id INTEGER,
    content_id INTEGER,
    sequenceNo INTEGER
  );

  INSERT INTO playlist_content VALUES (1, 1, 1);
  INSERT INTO playlist_content VALUES (1, 2, 2);
  INSERT INTO playlist_content VALUES (1, 4, 3);
  INSERT INTO playlist_content VALUES (3, 1, 1);
  INSERT INTO playlist_content VALUES (3, 4, 2);
  INSERT INTO playlist_content VALUES (3, 5, 3);
  INSERT INTO playlist_content VALUES (4, 2, 1);
  INSERT INTO playlist_content VALUES (4, 5, 2);

  -- ============================================================================
  -- MyTag table
  -- ============================================================================
  CREATE TABLE myTag (
    myTag_id INTEGER PRIMARY KEY,
    sequenceNo INTEGER,
    name TEXT,
    attribute INTEGER,
    myTag_id_parent INTEGER
  );

  INSERT INTO myTag VALUES (1, 1, 'Favorites', 0, NULL);
  INSERT INTO myTag VALUES (2, 2, 'Energy', 1, NULL);
  INSERT INTO myTag VALUES (3, 1, 'High Energy', 0, 2);
  INSERT INTO myTag VALUES (4, 2, 'Low Energy', 0, 2);
  INSERT INTO myTag VALUES (5, 3, 'Classics', 0, NULL);

  -- ============================================================================
  -- MyTag content table
  -- ============================================================================
  CREATE TABLE myTag_content (
    myTag_id INTEGER,
    content_id INTEGER
  );

  INSERT INTO myTag_content VALUES (1, 1);
  INSERT INTO myTag_content VALUES (1, 4);
  INSERT INTO myTag_content VALUES (3, 1);
  INSERT INTO myTag_content VALUES (3, 4);
  INSERT INTO myTag_content VALUES (4, 2);
  INSERT INTO myTag_content VALUES (5, 1);
  INSERT INTO myTag_content VALUES (5, 2);

  -- ============================================================================
  -- History table
  -- ============================================================================
  CREATE TABLE history (
    history_id INTEGER PRIMARY KEY,
    sequenceNo INTEGER,
    name TEXT,
    attribute INTEGER,
    history_id_parent INTEGER
  );

  INSERT INTO history VALUES (1, 1, '2024-01-01', 0, NULL);
  INSERT INTO history VALUES (2, 2, '2024-01-02', 0, NULL);
  INSERT INTO history VALUES (3, 3, '2024-01-03', 0, NULL);

  -- ============================================================================
  -- History content table
  -- ============================================================================
  CREATE TABLE history_content (
    history_id INTEGER,
    content_id INTEGER,
    sequenceNo INTEGER
  );

  INSERT INTO history_content VALUES (1, 1, 1);
  INSERT INTO history_content VALUES (1, 2, 2);
  INSERT INTO history_content VALUES (1, 4, 3);
  INSERT INTO history_content VALUES (2, 4, 1);
  INSERT INTO history_content VALUES (2, 5, 2);
  INSERT INTO history_content VALUES (2, 1, 3);
  INSERT INTO history_content VALUES (3, 2, 1);

  -- ============================================================================
  -- HotCueBankList table
  -- ============================================================================
  CREATE TABLE hotCueBankList (
    hotCueBankList_id INTEGER PRIMARY KEY,
    sequenceNo INTEGER,
    name TEXT,
    image_id INTEGER,
    attribute INTEGER,
    hotCueBankList_id_parent INTEGER
  );

  INSERT INTO hotCueBankList VALUES (1, 1, 'Bank A', NULL, 0, NULL);
  INSERT INTO hotCueBankList VALUES (2, 2, 'Bank B', NULL, 0, NULL);

  -- ============================================================================
  -- HotCueBankList cue table
  -- ============================================================================
  CREATE TABLE hotCueBankList_cue (
    hotCueBankList_id INTEGER,
    cue_id INTEGER,
    sequenceNo INTEGER
  );

  INSERT INTO hotCueBankList_cue VALUES (1, 2, 1);
  INSERT INTO hotCueBankList_cue VALUES (1, 4, 2);
  INSERT INTO hotCueBankList_cue VALUES (2, 5, 1);
  INSERT INTO hotCueBankList_cue VALUES (2, 6, 2);

  -- ============================================================================
  -- MenuItem table
  -- ============================================================================
  CREATE TABLE menuItem (
    menuItem_id INTEGER PRIMARY KEY,
    kind INTEGER,
    name TEXT
  );

  INSERT INTO menuItem VALUES (1, 128, 'Genre');
  INSERT INTO menuItem VALUES (2, 129, 'Artist');
  INSERT INTO menuItem VALUES (3, 130, 'Album');
  INSERT INTO menuItem VALUES (4, 131, 'Track');
  INSERT INTO menuItem VALUES (5, 139, 'Key');

  -- ============================================================================
  -- Category table
  -- ============================================================================
  CREATE TABLE category (
    category_id INTEGER PRIMARY KEY,
    menuItem_id INTEGER,
    sequenceNo INTEGER,
    isVisible INTEGER
  );

  INSERT INTO category VALUES (1, 1, 1, 1);
  INSERT INTO category VALUES (2, 2, 2, 1);
  INSERT INTO category VALUES (3, 3, 3, 1);
  INSERT INTO category VALUES (4, 4, 4, 0);
  INSERT INTO category VALUES (5, 5, 5, 1);

  -- ============================================================================
  -- Sort table
  -- ============================================================================
  CREATE TABLE sort (
    sort_id INTEGER PRIMARY KEY,
    menuItem_id INTEGER,
    sequenceNo INTEGER,
    isVisible INTEGER,
    isSelectedAsSubColumn INTEGER
  );

  INSERT INTO sort VALUES (1, 1, 1, 1, 0);
  INSERT INTO sort VALUES (2, 2, 2, 1, 1);
  INSERT INTO sort VALUES (3, 3, 3, 0, 0);
  INSERT INTO sort VALUES (4, 4, 4, 1, 0);
`);

db.close();

console.log(`Created test database at: ${DB_PATH}`);
console.log('Database is encrypted with the standard OneLibrary key.');
console.log('');
console.log('Test data includes:');
console.log('  - 5 tracks with various metadata configurations');
console.log('  - 6 cue points (memory cues, hot cues, loops)');
console.log('  - 5 playlists (including folders and nested)');
console.log('  - 5 myTags (including folders and nested)');
console.log('  - 3 history sessions');
console.log('  - 2 hot cue bank lists');
console.log('  - 5 menu items with categories and sort options');
