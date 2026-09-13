/**
 * PCOB (cue list) parser tests.
 *
 * The section objects mirror what the Kaitai-generated parser produces for
 * `cue_tag` / `cue_entry` (see src/localdb/kaitai/rekordbox_anlz.ksy): each
 * entry carries `hotCue` (0 for a memory cue, otherwise the button number),
 * `type` (1 = cue point, 2 = loop), `time` and `loopTime` in milliseconds.
 */

import {makeCueAndLoop} from 'src/localdb/rekordbox/anlz-parsers';
import {HotcueButton} from 'src/types';

const entry = (hotCue: number, type: number, time: number, loopTime = 0) => ({
  hotCue,
  status: 1,
  type,
  time,
  loopTime,
});

const section = (cues: unknown[]) => ({fourcc: 0x50434f42, body: {type: 0, cues}});

describe('makeCueAndLoop', () => {
  it('maps memory cue points and loops', () => {
    const result = makeCueAndLoop(section([entry(0, 1, 1000), entry(0, 2, 2000, 3000)]));

    expect(result).toEqual([
      {type: 'cue_point', offset: 1000},
      {type: 'loop', offset: 2000, length: 1000},
    ]);
  });

  it('takes the hot cue button from hotCue, not from the entry type', () => {
    const result = makeCueAndLoop(
      section([entry(3, 1, 4000), entry(8, 2, 5000, 6000), entry(1, 1, 7000)])
    );

    expect(result).toEqual([
      {type: 'hot_cue', offset: 4000, button: HotcueButton.C},
      {type: 'hot_loop', offset: 5000, length: 1000, button: HotcueButton.H},
      {type: 'hot_cue', offset: 7000, button: HotcueButton.A},
    ]);
  });

  it('drops entries that are neither a cue nor a loop', () => {
    const result = makeCueAndLoop(section([entry(0, 0, 100), entry(0, 1, 200)]));

    expect(result).toEqual([{type: 'cue_point', offset: 200}]);
  });
});
