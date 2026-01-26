import {makeCueLoopEntry} from 'src/localdb/utils';
import {
  BeatGrid,
  CueAndLoop,
  ExtendedCue,
  HotcueButton,
  Phrase,
  SongStructure,
  WaveformHD,
  WaveformPreviewData,
} from 'src/types';
import {convertWaveformHDData} from 'src/utils/converters';

/**
 * Fill beatgrid data from the ANLZ section
 */
export function makeBeatGrid(data: any): BeatGrid {
  return data.body.beats.map((beat: any) => ({
    offset: beat.time,
    bpm: beat.tempo / 100,
    count: beat.beatNumber,
  }));
}

/**
 * Fill cue and loop data from the ANLZ section
 */
export function makeCueAndLoop(data: any): CueAndLoop[] {
  return data.body.cues.map((entry: any) => {
    // Cues with the status 0 are likely leftovers that were removed

    const button = entry.hotCue === 0 ? false : (entry.type as HotcueButton);
    const isCue = entry.type === 0x01;
    const isLoop = entry.type === 0x02;

    // NOTE: Unlike the remotedb, these entries are already in milliseconds.
    const offset = entry.time;
    const length = entry.loopTime - offset;

    return makeCueLoopEntry(isCue, isLoop, offset, length, button);
  });
}

/**
 * Fill waveform HD data from the ANLZ section
 */
export function makeWaveformHd(data: any): WaveformHD {
  return convertWaveformHDData(Buffer.from(data.body.entries));
}

/**
 * Parse extended cues (PCO2) with colors and comments
 */
export function makeExtendedCues(data: any): ExtendedCue[] {
  return data.body.cues.map((entry: any) => {
    const cue: ExtendedCue = {
      hotCue: entry.hotCue,
      type: entry.type,
      time: entry.time,
    };

    // Add loop end time if this is a loop
    if (entry.type === 2 && entry.loopTime !== undefined) {
      cue.loopTime = entry.loopTime;
    }

    // Add color ID for memory points/loops
    if (entry.colorId !== undefined && entry.colorId > 0) {
      cue.colorId = entry.colorId;
    }

    // Add hot cue color information
    if (entry.colorCode !== undefined && entry.colorCode > 0) {
      cue.colorCode = entry.colorCode;
      cue.colorRgb = {
        r: entry.colorRed ?? 0,
        g: entry.colorGreen ?? 0,
        b: entry.colorBlue ?? 0,
      };
    }

    // Add comment if present
    if (entry.lenComment > 0 && entry.comment) {
      cue.comment = entry.comment;
    }

    // Add quantized loop information if present
    if (entry.loopNumerator !== undefined && entry.loopNumerator > 0) {
      cue.loopNumerator = entry.loopNumerator;
      cue.loopDenominator = entry.loopDenominator ?? 1;
    }

    return cue;
  });
}

/**
 * Parse song structure (PSSI) with phrase analysis
 */
export function makeSongStructure(data: any): SongStructure {
  const moodMap: Record<number, 'high' | 'mid' | 'low'> = {
    1: 'high',
    2: 'mid',
    3: 'low',
  };

  const bankMap: Record<number, SongStructure['bank']> = {
    0: 'default',
    1: 'cool',
    2: 'natural',
    3: 'hot',
    4: 'subtle',
    5: 'warm',
    6: 'vivid',
    7: 'club_1',
    8: 'club_2',
  };

  // Phrase type mappings based on mood
  const phraseTypeMap: Record<'high' | 'mid' | 'low', Record<number, string>> = {
    high: {
      1: 'Intro',
      2: 'Up',
      3: 'Down',
      5: 'Chorus',
      6: 'Outro',
    },
    mid: {
      1: 'Intro',
      2: 'Verse 1',
      3: 'Verse 2',
      4: 'Verse 3',
      5: 'Verse 4',
      6: 'Verse 5',
      7: 'Verse 6',
      8: 'Bridge',
      9: 'Chorus',
      10: 'Outro',
    },
    low: {
      1: 'Intro',
      2: 'Verse 1',
      3: 'Verse 1',
      4: 'Verse 1',
      5: 'Verse 2',
      6: 'Verse 2',
      7: 'Verse 2',
      8: 'Bridge',
      9: 'Chorus',
      10: 'Outro',
    },
  };

  const mood = moodMap[data.body.mood] ?? 'high';
  const bank = bankMap[data.body.rawBank] ?? 'default';

  const phrases: Phrase[] = data.body.entries.map((entry: any) => {
    const phrase: Phrase = {
      index: entry.index,
      beat: entry.beat,
      kind: entry.kind,
      phraseType: phraseTypeMap[mood][entry.kind] ?? 'Unknown',
    };

    // Add fill-in information if present
    if (entry.fill > 0) {
      phrase.fill = entry.fill;
      phrase.fillBeat = entry.beatFill;
    }

    return phrase;
  });

  return {
    mood,
    bank,
    endBeat: data.body.endBeat,
    phrases,
  };
}

/**
 * Parse waveform preview data (PWAV/PWV2)
 */
export function makeWaveformPreview(data: any): WaveformPreviewData {
  return {
    data: Buffer.from(data.body.data),
  };
}
