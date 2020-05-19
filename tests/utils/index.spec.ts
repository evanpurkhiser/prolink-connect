import each from 'jest-each';

import {bpmToSeconds} from 'src/utils';

describe('bpmToSeconds', () => {
  each([
    [60, 0, 1],
    [120, 0, 0.5],
    [60, 25, 0.8],
  ]).it(
    'Computes [%d bpm at %d pitch] as %d second per beat',
    (bpm, pitch, secondsPerBeat) => {
      expect(bpmToSeconds(bpm, pitch)).toEqual(secondsPerBeat);
    }
  );
});
