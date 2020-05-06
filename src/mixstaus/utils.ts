import {CDJStatus} from 'src/types';

const playingStates = [CDJStatus.PlayState.Playing, CDJStatus.PlayState.Looping];

const stoppingStates = [
  CDJStatus.PlayState.Cued,
  CDJStatus.PlayState.Ended,
  CDJStatus.PlayState.Loading,
];

/**
 * Returns true if the the status reports a playing state.
 */
export const isPlaying = (s: CDJStatus.State) => playingStates.includes(s.playState);

/**
 * Returns true if the status reports a stopping state.
 */
export const isStopping = (s: CDJStatus.State) => stoppingStates.includes(s.playState);
