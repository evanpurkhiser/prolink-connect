/**
 * PCO2 (extended cue list) parser tests.
 *
 * The section objects mirror what the Kaitai-generated parser produces for
 * `cue_extended_entry` (see src/localdb/kaitai/rekordbox_anlz.ksy).
 */

import {makeExtendedCues} from 'src/localdb/rekordbox/anlz-parsers';

const section = (cues: unknown[]) => ({fourcc: 0x50434f32, body: {type: 0, cues}});

describe('makeExtendedCues', () => {
  it('maps a plain memory cue', () => {
    const [cue] = makeExtendedCues(
      section([{hotCue: 0, type: 1, time: 1000, loopTime: 0, colorId: 0, lenComment: 0}])
    );

    expect(cue).toEqual({hotCue: 0, type: 1, time: 1000});
  });

  it('carries the quantized loop size read from the tag', () => {
    const [cue] = makeExtendedCues(
      section([
        {
          hotCue: 0,
          type: 2,
          time: 2000,
          loopTime: 6000,
          colorId: 5,
          loopNumerator: 4,
          loopDenominator: 1,
          lenComment: 0,
        },
      ])
    );

    expect(cue).toEqual({
      hotCue: 0,
      type: 2,
      time: 2000,
      loopTime: 6000,
      colorId: 5,
      loopNumerator: 4,
      loopDenominator: 1,
    });
  });

  it('leaves loop size out when the loop is not quantized', () => {
    const [cue] = makeExtendedCues(
      section([
        {
          hotCue: 0,
          type: 2,
          time: 0,
          loopTime: 500,
          colorId: 0,
          loopNumerator: 0,
          loopDenominator: 0,
          lenComment: 0,
        },
      ])
    );

    expect(cue.loopNumerator).toBeUndefined();
    expect(cue.loopDenominator).toBeUndefined();
  });

  it('maps hot cue colours and comments', () => {
    const [cue] = makeExtendedCues(
      section([
        {
          hotCue: 3,
          type: 1,
          time: 3000,
          loopTime: 0,
          colorId: 0,
          lenComment: 10,
          comment: 'Drop\0',
          colorCode: 0x2a,
          colorRed: 255,
          colorGreen: 0,
          colorBlue: 0,
        },
      ])
    );

    expect(cue).toEqual({
      hotCue: 3,
      type: 1,
      time: 3000,
      comment: 'Drop',
      colorCode: 0x2a,
      colorRgb: {r: 255, g: 0, b: 0},
    });
  });

  it('drops a comment that is only the trailing NUL', () => {
    const [cue] = makeExtendedCues(
      section([
        {
          hotCue: 0,
          type: 1,
          time: 0,
          loopTime: 0,
          colorId: 0,
          lenComment: 2,
          comment: '\0',
        },
      ])
    );

    expect(cue.comment).toBeUndefined();
  });
});
