/**
 * 3-Band Waveform & Vocal Detection Example
 *
 * Demonstrates how to parse .2EX analysis files to extract:
 * - PWV6: 3-band color waveform preview (low/mid/high frequency bands)
 * - PWV7: 3-band color detail waveform (higher resolution)
 * - PWVC: Vocal detection configuration (threshold values)
 *
 * Includes a practical example of computing vocal regions by comparing
 * waveform band amplitudes against vocal thresholds.
 *
 * NOTE: This is a conceptual example showing how to use the 3-band waveform
 * and vocal detection features. For a working example, integrate with your
 * existing database connection code.
 */

import type {Track} from '../src/entities';
import {loadAnlz} from '../src/localdb/rekordbox';

/**
 * Example function showing how to load and use 3-band waveform and vocal data
 */
async function analyze3BandWaveform(track: Track, anlzLoader: (path: string) => Promise<Buffer>) {
  console.log(`\nAnalyzing: ${track.artist?.name} - ${track.title}\n`);

  const anlz2ex = await loadAnlz(track, '2EX', anlzLoader);

  // ============================================================================
  // 3-Band Waveform Preview (PWV6) — Overview of the entire track
  // ============================================================================

  if (anlz2ex.waveform3BandPreview) {
    const {numEntries, data} = anlz2ex.waveform3BandPreview;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  3-BAND WAVEFORM PREVIEW (PWV6)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n  Entries: ${numEntries}`);
    console.log(`  Raw data: ${data.length} bytes (${numEntries} × 3 bands)\n`);

    // Data is interleaved: [low0, mid0, high0, low1, mid1, high1, ...]
    // Each byte is 0–255 representing amplitude for that frequency band.

    const bands = extractBands(data, numEntries);

    // Show a few sample values
    console.log('  Sample values (normalized 0–1):');
    const samplePoints = [0, Math.floor(numEntries / 4), Math.floor(numEntries / 2), numEntries - 1];
    for (const i of samplePoints) {
      const pct = ((i / numEntries) * 100).toFixed(0);
      console.log(
        `    ${pct.padStart(3)}%: low=${bands.low[i].toFixed(2)}  mid=${bands.mid[i].toFixed(2)}  high=${bands.high[i].toFixed(2)}`
      );
    }
    console.log();

    // Render a simple ASCII waveform showing band dominance
    console.log('  ASCII waveform (dominant band per column):');
    console.log(`  ${'─'.repeat(60)}`);
    const cols = 60;
    let row = '  ';
    for (let c = 0; c < cols; c++) {
      const i = Math.floor((c / cols) * numEntries);
      const {low, mid, high} = {low: bands.low[i], mid: bands.mid[i], high: bands.high[i]};
      if (mid >= low && mid >= high) {
        row += 'M'; // mid-dominant (often vocals)
      } else if (low >= high) {
        row += 'L'; // low-dominant (bass)
      } else {
        row += 'H'; // high-dominant (hats/cymbals)
      }
    }
    console.log(row);
    console.log('  L=Low(bass)  M=Mid(vocals)  H=High(treble)\n');
  }

  // ============================================================================
  // 3-Band Waveform Detail (PWV7) — Beat-level resolution
  // ============================================================================

  if (anlz2ex.waveform3BandDetail) {
    const {numEntries, data} = anlz2ex.waveform3BandDetail;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  3-BAND WAVEFORM DETAIL (PWV7)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n  Entries: ${numEntries}`);
    console.log(`  Raw data: ${data.length} bytes (${numEntries} × 3 bands)`);
    console.log('  → Use for high-resolution visualization or per-entry analysis\n');
  }

  // ============================================================================
  // Vocal Config (PWVC) — Threshold values for vocal detection
  // ============================================================================

  if (anlz2ex.vocalConfig) {
    const {thresholdLow, thresholdMid, thresholdHigh} = anlz2ex.vocalConfig;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  VOCAL DETECTION CONFIG (PWVC)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n  Threshold Low:  ${thresholdLow} (${(thresholdLow / 255).toFixed(4)} normalized)`);
    console.log(`  Threshold Mid:  ${thresholdMid} (${(thresholdMid / 255).toFixed(4)} normalized)`);
    console.log(`  Threshold High: ${thresholdHigh} (${(thresholdHigh / 255).toFixed(4)} normalized)\n`);
  }

  // ============================================================================
  // Practical Example: Compute vocal regions from waveform + thresholds
  // ============================================================================

  if (anlz2ex.waveform3BandPreview && anlz2ex.vocalConfig) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  VOCAL REGIONS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const {numEntries, data} = anlz2ex.waveform3BandPreview;
    const {thresholdLow, thresholdMid, thresholdHigh} = anlz2ex.vocalConfig;
    const bands = extractBands(data, numEntries);

    // Normalize thresholds to match waveform range (0–1). Values are u16 but
    // observed range is 0–255 (same byte scale as waveform band values).
    const normLow = thresholdLow / 255;
    const normMid = thresholdMid / 255;
    const normHigh = thresholdHigh / 255;

    // A region is "vocal" when mid exceeds its threshold while low and high
    // stay below theirs — meaning the mid-frequency band dominates.
    const regions = findVocalRegions(bands, numEntries, normLow, normMid, normHigh);

    if (regions.length === 0) {
      console.log('  No vocal regions detected.\n');
    } else {
      console.log(`  Found ${regions.length} vocal region(s):\n`);
      for (const region of regions) {
        const startPct = ((region.start / numEntries) * 100).toFixed(1);
        const endPct = ((region.end / numEntries) * 100).toFixed(1);
        const length = region.end - region.start;
        console.log(`    ${startPct.padStart(5)}% – ${endPct.padStart(5)}%  (${length} entries)`);
      }
      console.log();

      // Visual timeline
      console.log('  Timeline (V=vocal, ·=instrumental):');
      console.log(`  ${'─'.repeat(60)}`);
      const cols = 60;
      let timeline = '  ';
      for (let c = 0; c < cols; c++) {
        const pos = (c / cols) * numEntries;
        const inVocal = regions.some(r => pos >= r.start && pos < r.end);
        timeline += inVocal ? 'V' : '·';
      }
      console.log(timeline);
      console.log();
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

interface Bands {
  low: number[];
  mid: number[];
  high: number[];
}

/**
 * Extract interleaved byte data into separate normalized band arrays.
 * Input bytes are 0–255; output values are normalized to 0–1.
 */
function extractBands(data: Uint8Array, numEntries: number): Bands {
  const low: number[] = [];
  const mid: number[] = [];
  const high: number[] = [];

  for (let i = 0; i < numEntries; i++) {
    low.push(data[i * 3] / 255);
    mid.push(data[i * 3 + 1] / 255);
    high.push(data[i * 3 + 2] / 255);
  }

  return {low, mid, high};
}

interface VocalRegion {
  start: number;
  end: number;
}

/**
 * Find contiguous regions where mid-frequency dominance suggests vocals.
 * A point is considered "vocal" when mid exceeds its threshold while
 * low and high remain below theirs.
 */
function findVocalRegions(
  bands: Bands,
  numEntries: number,
  thresholdLow: number,
  thresholdMid: number,
  thresholdHigh: number
): VocalRegion[] {
  const regions: VocalRegion[] = [];
  let regionStart: number | null = null;

  for (let i = 0; i < numEntries; i++) {
    const isVocal =
      bands.mid[i] > thresholdMid &&
      bands.low[i] < thresholdLow &&
      bands.high[i] < thresholdHigh;

    if (isVocal && regionStart === null) {
      regionStart = i;
    } else if (!isVocal && regionStart !== null) {
      regions.push({start: regionStart, end: i});
      regionStart = null;
    }
  }

  if (regionStart !== null) {
    regions.push({start: regionStart, end: numEntries});
  }

  return regions;
}

/**
 * Example usage:
 *
 * const track = await getTrackFromDatabase();
 * const anlzLoader = (path: string) => readAnlzFile(path);
 * await analyze3BandWaveform(track, anlzLoader);
 */
export {analyze3BandWaveform};
