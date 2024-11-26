import {CueAndLoop, HotcueButton} from 'src/types';

/**
 * Create a CueAndLoop entry given common parameters
 */
export const makeCueLoopEntry = (
  isCue: boolean,
  isLoop: boolean,
  offset: number,
  length: number,
  button: false | HotcueButton
): null | CueAndLoop =>
  button !== false
    ? isLoop
      ? {type: 'hot_loop', offset, length, button}
      : {type: 'hot_cue', offset, button}
    : isLoop
      ? {type: 'loop', offset, length}
      : isCue
        ? {type: 'cue_point', offset}
        : null;
