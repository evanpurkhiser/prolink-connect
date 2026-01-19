import {ExtractedArtwork} from '../types';

export function detectImageType(
  data: Buffer
): 'image/jpeg' | 'image/png' | 'image/gif' | null {
  if (data.length < 4) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (data.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
}

export function normalizeMimeType(mimeType: string): ExtractedArtwork['mimeType'] {
  const lower = mimeType.toLowerCase();
  if (lower.includes('png')) return 'image/png';
  if (lower.includes('gif')) return 'image/gif';
  return 'image/jpeg';
}
