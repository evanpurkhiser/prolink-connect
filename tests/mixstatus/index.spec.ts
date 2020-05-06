import MixstatusProcessor from 'src/mixstaus';
import {CDJStatus, MediaSlot, TrackType} from 'src/types';
import {bpmToSeconds} from 'src/utils';

const MOCK_BPM = 60;

const makeState = (state?: Partial<CDJStatus.State>): CDJStatus.State => ({
  deviceId: 0,
  trackId: 0,
  trackDeviceId: 1,
  trackSlot: MediaSlot.USB,
  trackType: TrackType.RB,
  playState: CDJStatus.PlayState.Empty,
  isOnAir: false,
  isSync: false,
  isMaster: false,
  trackBPM: MOCK_BPM,
  sliderPitch: 0,
  effectivePitch: 0,
  beatInMeasure: 0,
  beatsUntilCue: 0,
  beat: 0,
  packetNum: 0,
  ...state,
});

describe('mixstatus processor', function () {
  let currentNow = 0;
  let lastFedState = new Map<number, CDJStatus.State>();

  jest.useFakeTimers();
  global.Date.now = jest.fn(() => currentNow);

  let processor: MixstatusProcessor;

  /**
   * Feed state to the processor. Remembering the last state and merging tnew
   * new state in.
   */
  const feedState = (deviceId: number, state: Partial<CDJStatus.State>) => {
    const lastState = lastFedState.get(deviceId) ?? makeState({deviceId});
    const nextState = {...lastState, ...state};

    lastFedState.set(deviceId, nextState);
    processor.handleState(nextState);
  };

  const advanceByBeatCount = (beats: number) => {
    const ms = bpmToSeconds(MOCK_BPM, 0) * beats * 1000;
    jest.advanceTimersByTime(ms);
    jest.runAllTimers();
    currentNow += ms;
  };

  beforeEach(function () {
    lastFedState.clear();
    processor = new MixstatusProcessor();
    currentNow = 0;
  });

  it('does not report first state if not onair and playing', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    feedState(5, {
      trackId: 123,
      playState: CDJStatus.PlayState.Playing,
    });
    expect(npHandler).not.toBeCalled();
  });

  it('reports an immediate on-air playing device as nowPlaying', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    feedState(5, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Playing,
    });
    expect(npHandler).toBeCalledWith({deviceId: 5, trackId: 123});
  });

  it('reports the stopping of a single device', function () {
    const stoppedHandler = jest.fn();
    processor.on('stopped', stoppedHandler);

    feedState(5, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Playing,
    });
    advanceByBeatCount(64);
    feedState(5, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Ended,
    });
    expect(stoppedHandler).toBeCalledWith({deviceId: 5});
  });

  it('reports the first device as playing when no others are', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    // Send cued states for two players
    feedState(1, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Cued,
    });
    feedState(2, {
      trackId: 321,
      isOnAir: true,
      playState: CDJStatus.PlayState.Cued,
    });

    expect(npHandler).not.toBeCalled();

    // Start 2nd player playing
    feedState(2, {playState: CDJStatus.PlayState.Playing});

    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 321});
  });

  it('reports that a set has started when a player starts', function () {
    const ssHandler = jest.fn();
    processor.on('setStarted', ssHandler);

    feedState(1, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Cued,
    });

    feedState(1, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Playing,
    });

    expect(ssHandler).toBeCalledTimes(1);
  });

  /**
   * Loads one track, then a second, then starts palying the second offair.
   */
  const setupTwoTracks = () => {
    feedState(1, {
      deviceId: 1,
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Playing,
    });
    feedState(2, {});
    feedState(2, {
      trackId: 234,
      playState: CDJStatus.PlayState.Playing,
    });
  };

  it('does not report offair tracks when played', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();

    // Only first player is playing on air
    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).lastCalledWith({deviceId: 1, trackId: 123});
  });

  it('reports next device after the configured beats pass and both are live', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    expect(npHandler).not.toBeCalled();

    // Player 2 stays onair. At beat 128 it is reported live.
    advanceByBeatCount(64);
    feedState(2, {});

    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 234});
  });

  it('reports the next device early if the first is stopped', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 1 stops, player 2 should report early
    feedState(1, {playState: CDJStatus.PlayState.Cued});

    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 234});
  });

  it('reports the next device early if the first is paused', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 1 stops, player 2 should report early
    feedState(1, {playState: CDJStatus.PlayState.Paused});

    // Wait 8 more beats to account for the interrupt beats
    advanceByBeatCount(8);
    feedState(1, {});

    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 234});
  });

  it('reports the next device early if the first goes off air', function () {
    const npHandler = jest.fn();
    const stoppedHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    processor.on('stopped', stoppedHandler);

    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 1 goes off-air, player 2 should report early
    feedState(1, {isOnAir: false});

    expect(stoppedHandler).toBeCalledTimes(0);

    // Wait 8 more beats to account for the interrupt beats
    advanceByBeatCount(8);
    feedState(1, {});

    expect(stoppedHandler).toBeCalledTimes(1);
    expect(stoppedHandler).toBeCalledWith({deviceId: 1});

    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 234});
  });

  it('reports the device playing the longest if the playing track stops', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Add one additional player that starts 32 beats in
    advanceByBeatCount(32);
    feedState(3, {
      trackId: 2,
      isOnAir: true,
      playState: CDJStatus.PlayState.Playing,
    });

    // Player 2 comes onair after 32 more beats
    advanceByBeatCount(32);
    feedState(2, {isOnAir: true});

    // Player 1 stops, player 2 should report early
    feedState(1, {playState: CDJStatus.PlayState.Cued});

    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 234});
  });

  it('allow pause interrupts before the next device is reported live', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 1 pauses 4 beats, the next track is NOT reported live
    feedState(1, {playState: CDJStatus.PlayState.Paused});
    advanceByBeatCount(4);
    feedState(1, {playState: CDJStatus.PlayState.Playing});
    expect(npHandler).not.toBeCalled();

    // Player 2 stays onair. At beat 128 it is reported live.
    advanceByBeatCount(60);
    feedState(2, {});

    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 234});
  });

  it('allow onair interrupts before the next device is reported live', function () {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 1 pauses 4 beats, the next track is NOT reported live
    feedState(1, {isOnAir: false});
    advanceByBeatCount(4);
    feedState(1, {isOnAir: true});
    expect(npHandler).not.toBeCalled();

    // Player 2 stays onair. At beat 128 it is reported live.
    advanceByBeatCount(60);
    feedState(2, {});

    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).toBeCalledWith({deviceId: 2, trackId: 234});
  });

  it('reports that a set has ended when all players stop', function () {
    const seHandler = jest.fn();
    processor.on('setEnded', seHandler);
    setupTwoTracks();

    feedState(1, {playState: CDJStatus.PlayState.Cued});
    feedState(2, {playState: CDJStatus.PlayState.Cued});

    expect(seHandler).not.toHaveBeenCalled();

    // Set ending does not happen in beat intervals
    jest.advanceTimersByTime(300000);
    jest.runOnlyPendingTimers();

    console.log('checking set end');

    expect(seHandler).toHaveBeenCalled();
  });
});
