import {bpmToSeconds} from 'src/utils';

describe('bpmToSeconds', () => {
  it.each([
    [60, 0, 1],
    [120, 0, 0.5],
    [60, 25, 0.8],
  ])(
    'computes [%d bpm at %d pitch] as %d second per beat',
    (bpm, pitch, secondsPerBeat) => {
      expect(bpmToSeconds(bpm, pitch)).toEqual(secondsPerBeat);
    },
  );
});
