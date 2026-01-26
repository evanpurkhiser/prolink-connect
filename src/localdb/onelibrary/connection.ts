/**
 * OneLibrary Database Connection
 */

import Database from 'better-sqlite3-multiple-ciphers';

import {getEncryptionKey} from './encryption';

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
