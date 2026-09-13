/**
 * PCOB (cue list) entries that are neither a cue point nor a loop must not
 * leak into the CueAndLoop[] the parser returns.
 */

import {makeCueAndLoop} from 'src/localdb/rekordbox/anlz-parsers';

const entry = (hotCue: number, type: number, time: number, loopTime = 0) => ({
  hotCue,
  status: 1,
  type,
  time,
  loopTime,
});

describe('makeCueAndLoop', () => {
  it('drops entries that are neither a cue point nor a loop', () => {
    const result = makeCueAndLoop({
      body: {type: 0, cues: [entry(0, 0, 100), entry(0, 1, 200), entry(0, 9, 300)]},
    });

    expect(result).toEqual([{type: 'cue_point', offset: 200}]);
  });

  it('returns an empty list when nothing survives', () => {
    expect(makeCueAndLoop({body: {type: 0, cues: [entry(0, 0, 100)]}})).toEqual([]);
  });
});
