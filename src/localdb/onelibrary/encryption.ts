/**
 * OneLibrary Database Encryption
 *
 * The database is encrypted with SQLCipher 4. The encryption key is derived from
 * a hardcoded obfuscated blob.
 */

import * as zlib from 'zlib';

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
