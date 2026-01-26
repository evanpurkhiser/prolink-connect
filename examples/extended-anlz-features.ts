/**
 * Example demonstrating the use of extended ANLZ features including:
 * - Extended cues with colors and comments (PCO2)
 * - Song structure / phrase analysis (PSSI)
 * - Waveform previews (PWAV, PWV2)
 * - Detailed waveforms (PWV3, PWV4)
 *
 * NOTE: This is a conceptual example showing how to use the extended ANLZ features.
 * For a working example, integrate with your existing database connection code.
 */

import type {Track} from '../src/entities';
import {loadAnlz} from '../src/localdb/rekordbox';

/**
 * Example function showing how to load and use extended ANLZ data
 */
async function analyzeTrack(track: Track, anlzLoader: (path: string) => Promise<Buffer>) {
  console.log(`\nAnalyzing: ${track.artist?.name} - ${track.title}\n`);

  // ============================================================================
  // Load Extended Cues (PCO2) - Colors, Comments, and Quantized Loop Info
  // ============================================================================

  const extAnlz = await loadAnlz(track, 'EXT', anlzLoader);

  if (extAnlz.extendedCues) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  EXTENDED CUES (with colors and comments)');
    console.log('═══════════════════════════════════════════════════════════');

    for (const cue of extAnlz.extendedCues) {
      const type = cue.type === 1 ? 'Cue' : 'Loop';
      const hotcueLabel =
        cue.hotCue > 0 ? ` [Hot Cue ${String.fromCharCode(64 + cue.hotCue)}]` : '';

      console.log(`\n${type}${hotcueLabel} at ${formatTime(cue.time)}`);

      if (cue.comment) {
        console.log(`  Comment: "${cue.comment}"`);
      }

      if (cue.colorRgb) {
        const {r, g, b} = cue.colorRgb;
        console.log(`  Color: RGB(${r}, ${g}, ${b}) [Code: ${cue.colorCode}]`);
      }

      if (cue.loopTime) {
        const duration = cue.loopTime - cue.time;
        console.log(`  Loop duration: ${formatTime(duration)}`);
      }

      if (cue.loopNumerator && cue.loopDenominator) {
        console.log(`  Quantized: ${cue.loopNumerator}/${cue.loopDenominator} beats`);
      }
    }
    console.log();
  }

  // ============================================================================
  // Load Song Structure (PSSI) - Phrase Analysis for CDJ-3000 and Lighting
  // ============================================================================

  if (extAnlz.songStructure) {
    const {mood, bank, endBeat, phrases} = extAnlz.songStructure;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SONG STRUCTURE (Phrase Analysis)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n  Mood: ${mood.toUpperCase()}`);
    console.log(`  Lighting Bank: ${bank}`);
    console.log(`  Last phrase ends at beat: ${endBeat}\n`);

    console.log('  Phrases:');
    console.log(`  ${'─'.repeat(57)}`);

    for (const phrase of phrases) {
      const fillInfo = phrase.fill ? ` (fill-in at beat ${phrase.fillBeat})` : '';
      console.log(
        `  Beat ${String(phrase.beat).padStart(4)}: ${phrase.phraseType.padEnd(20)}${fillInfo}`
      );
    }
    console.log();
  }

  // ============================================================================
  // Load Waveform Previews (PWAV, PWV2)
  // ============================================================================

  const datAnlz = await loadAnlz(track, 'DAT', anlzLoader);

  if (datAnlz.waveformPreview) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  WAVEFORM PREVIEWS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(
      `\n  Standard Preview (PWAV): ${datAnlz.waveformPreview.data.length} bytes`
    );
    console.log('  → Used on Nexus displays above the touch strip');
  }

  if (datAnlz.waveformTiny) {
    console.log(`\n  Tiny Preview (PWV2): ${datAnlz.waveformTiny.data.length} bytes`);
    console.log('  → Used on CDJ-900 displays\n');
  }

  // ============================================================================
  // Load Detailed Waveforms (PWV3, PWV4, PWV5)
  // ============================================================================

  if (extAnlz.waveformDetail) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  DETAILED WAVEFORMS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n  Monochrome Detail (PWV3): ${extAnlz.waveformDetail.length} bytes`);
    console.log('  → Scrolls during playback, 150 segments per second');
  }

  if (extAnlz.waveformColorPreview) {
    console.log(`\n  Color Preview (PWV4): ${extAnlz.waveformColorPreview.length} bytes`);
    console.log('  → 1200 columns × 6 bytes, shown above touch strip on Nexus 2');
  }

  if (extAnlz.waveformHd) {
    console.log(`\n  HD Color Detail (PWV5): ${extAnlz.waveformHd.length} segments`);
    console.log('  → Full color, scrolls during playback on Nexus 2\n');
  }

  // ============================================================================
  // Practical Example: Find phrases for timing lighting changes
  // ============================================================================

  if (extAnlz.songStructure && datAnlz.beatGrid) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  PHRASE TIMING (for lighting cues)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const beatGrid = datAnlz.beatGrid;
    const {phrases} = extAnlz.songStructure;

    for (const phrase of phrases.slice(0, 10)) {
      // Find the corresponding beat in the beat grid
      const beat = beatGrid.find(
        (b: any) => b.offset >= phrase.beat * (60000 / beatGrid[0].bpm)
      );

      if (beat) {
        const timeStr = formatTime(beat.offset);
        console.log(
          `  ${timeStr} - ${phrase.phraseType.padEnd(20)} (Beat ${phrase.beat})`
        );
      }
    }
    console.log();
  }

  // ============================================================================
  // Practical Example: Export cues with comments to JSON
  // ============================================================================

  if (extAnlz.extendedCues) {
    const cuesWithComments = extAnlz.extendedCues.filter((cue: any) => cue.comment);

    if (cuesWithComments.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  ANNOTATED CUES (JSON Export)');
      console.log('═══════════════════════════════════════════════════════════\n');

      const exportData = cuesWithComments.map((cue: any) => ({
        hotCue: String.fromCharCode(64 + cue.hotCue),
        type: cue.type === 1 ? 'cue' : 'loop',
        time: formatTime(cue.time),
        comment: cue.comment,
        color: cue.colorRgb ? `#${rgbToHex(cue.colorRgb)}` : undefined,
      }));

      console.log(JSON.stringify(exportData, null, 2));
      console.log();
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
}

function rgbToHex(rgb: {r: number; g: number; b: number}): string {
  return [rgb.r, rgb.g, rgb.b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Example usage:
 *
 * // After connecting to a device and getting a track
 * const track = await getTrackFromDatabase();
 * const anlzLoader = (path: string) => readAnlzFile(path);
 * await analyzeTrack(track, anlzLoader);
 */
export {analyzeTrack};
