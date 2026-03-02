import {KaitaiStream} from 'kaitai-struct';

import {Track} from 'src/entities';
import RekordboxAnlz from 'src/localdb/kaitai/rekordbox_anlz.ksy';

import {
  makeBeatGrid,
  makeCueAndLoop,
  makeExtendedCues,
  makeSongStructure,
  makeVocalConfig,
  makeWaveform3BandDetail,
  makeWaveform3BandPreview,
  makeWaveformHd,
  makeWaveformPreview,
} from './anlz-parsers';
import {RekordboxHydrator} from './hydrator';
import type {
  AnlzResolver,
  AnlzResponse,
  AnlzResponse2EX,
  AnlzResponseDAT,
  AnlzResponseEXT,
  HydrationOptions,
  HydrationProgress,
} from './types';

const {SectionTags} = RekordboxAnlz;

// Re-export types
export type {
  AnlzResolver,
  AnlzResponse,
  AnlzResponse2EX,
  AnlzResponseDAT,
  AnlzResponseEXT,
  HydrationOptions,
  HydrationProgress,
};

/**
 * Given a rekordbox pdb file contents. This function will hydrate the provided
 * database with all entities from the Rekordbox database. This includes all
 * track metadata, including analyzed metadata (such as beatgrids and waveforms).
 */
export async function hydrateDatabase({pdbData, span, ...options}: HydrationOptions) {
  const hydrator = new RekordboxHydrator(options);
  await hydrator.hydrateFromPdb(pdbData, span);
}

/**
 * Loads the ANLZ data of a Track entity from the analyzePath.
 */
export async function loadAnlz<T extends keyof AnlzResponse>(
  track: Track,
  type: T,
  anlzResolver: AnlzResolver
): Promise<AnlzResponse[T]> {
  const path = `${track.analyzePath}.${type}`;
  const anlzData = await anlzResolver(path);

  const stream = new KaitaiStream(anlzData);
  const anlz = new RekordboxAnlz(stream);

  const result = {} as AnlzResponse[T];
  const resultDat = result as AnlzResponseDAT;
  const resultExt = result as AnlzResponseEXT;
  const result2ex = result as AnlzResponse2EX;

  for (const section of anlz.sections) {
    switch (section.fourcc) {
      case SectionTags.BEAT_GRID:
        resultDat.beatGrid = makeBeatGrid(section);
        break;

      case SectionTags.CUES:
        resultDat.cueAndLoops = makeCueAndLoop(section);
        break;

      case SectionTags.CUES_2:
        resultExt.extendedCues = makeExtendedCues(section);
        break;

      case SectionTags.WAVE_PREVIEW:
        resultDat.waveformPreview = makeWaveformPreview(section);
        break;

      case SectionTags.WAVE_TINY:
        resultDat.waveformTiny = makeWaveformPreview(section);
        break;

      case SectionTags.WAVE_SCROLL:
        resultExt.waveformDetail = Buffer.from(section.body.entries);
        break;

      case SectionTags.WAVE_COLOR_PREVIEW:
        resultExt.waveformColorPreview = Buffer.from(section.body.entries);
        break;

      case SectionTags.WAVE_COLOR_SCROLL:
        resultExt.waveformHd = makeWaveformHd(section);
        break;

      case SectionTags.SONG_STRUCTURE:
        resultExt.songStructure = makeSongStructure(section);
        break;

      case SectionTags.WAVE_COLOR_3BAND_PREVIEW:
        result2ex.waveform3BandPreview = makeWaveform3BandPreview(section);
        break;

      case SectionTags.WAVE_COLOR_3BAND_DETAIL:
        result2ex.waveform3BandDetail = makeWaveform3BandDetail(section);
        break;

      case SectionTags.VOCAL_CONFIG:
        result2ex.vocalConfig = makeVocalConfig(section);
        break;

      // VBR and PATH tags are defined but not currently extracted
      // as they're not commonly needed in the application
      case SectionTags.VBR:
      case SectionTags.PATH:
        break;
    }
  }

  return result;
}
