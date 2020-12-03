import {MixstatusProcessor} from 'src/mixstatus';
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

const oc = expect.objectContaining;

describe('mixstatus processor', () => {
  let currentNow = 0;
  const lastFedState = new Map<number, CDJStatus.State>();

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

  beforeEach(() => {
    lastFedState.clear();
    processor = new MixstatusProcessor();
    currentNow = 0;
  });

  it('does not report first state if immediately not onair and playing', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    feedState(5, {
      trackId: 123,
      playState: CDJStatus.PlayState.Playing,
    });
    expect(npHandler).not.toBeCalled();
  });

  it('does not report first state if off-air and played as first track', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    feedState(1, {
      trackId: 123,
      playState: CDJStatus.PlayState.Cued,
    });

    feedState(1, {
      playState: CDJStatus.PlayState.Playing,
    });

    expect(npHandler).not.toBeCalled();
  });

  it('reports an immediate on-air playing device as nowPlaying', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    feedState(5, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Playing,
    });
    expect(npHandler).toBeCalledWith(oc({deviceId: 5, trackId: 123}));
  });

  it('reports tracks brought on-air when no others are playing', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    feedState(1, {
      trackId: 123,
      playState: CDJStatus.PlayState.Playing,
    });

    // Oops forgot to bring the track on air
    feedState(1, {isOnAir: true});

    expect(npHandler).toBeCalledWith(oc({deviceId: 1, trackId: 123}));
  });

  it('does not report off-air playing track after live track cues', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);

    // Player 1 is playing
    feedState(1, {
      trackId: 123,
      isOnAir: true,
      playState: CDJStatus.PlayState.Playing,
    });

    expect(npHandler).toHaveBeenCalledTimes(1);
    npHandler.mockReset();

    // Player 2 is off air and cued
    feedState(2, {
      trackId: 234,
      isOnAir: false,
      playState: CDJStatus.PlayState.Cued,
    });

    // Player 2 begins playing
    feedState(2, {
      playState: CDJStatus.PlayState.Playing,
    });

    // Player 1 cues
    feedState(1, {
      playState: CDJStatus.PlayState.Cued,
    });
    expect(npHandler).not.toHaveBeenCalled();
  });

  it('reports the stopping of a single device', () => {
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

  it('reports the first device as playing when no others are', () => {
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

    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 321}));
  });

  it('reports that a set has started when a player starts', () => {
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

  it('does not report offair tracks when played', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();

    // Only first player is playing on air
    expect(npHandler).toBeCalledTimes(1);
    expect(npHandler).lastCalledWith(oc({deviceId: 1, trackId: 123}));
  });

  it('does not report offair stopped tracks that come on air', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Both tracks stopped
    feedState(1, {playState: CDJStatus.PlayState.Cued});
    feedState(2, {playState: CDJStatus.PlayState.Cued});

    // Second track comes on air
    feedState(2, {isOnAir: true});

    // No players should have been reported as playing
    expect(npHandler).not.toHaveBeenCalled();
  });

  it('reports next device after the configured beats pass and both are live', () => {
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
    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('reports the next device early if the first is stopped', () => {
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
    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('reports the next device early if the first is paused', () => {
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
    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('reports the next device early if the first goes off air', () => {
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
    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('reports the device playing the longest if the playing track stops', () => {
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
    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('allow pause interrupts before the next device is reported live', () => {
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
    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('allow onair interrupts before the next device is reported live', () => {
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
    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('reports that a set has ended when all players stop', async () => {
    const seHandler = jest.fn();
    processor.on('setEnded', seHandler);
    setupTwoTracks();

    feedState(1, {playState: CDJStatus.PlayState.Cued});
    feedState(2, {playState: CDJStatus.PlayState.Cued});

    expect(seHandler).not.toHaveBeenCalled();

    // Set ending does not happen in beat intervals, so we don't use the
    // advanceByBeatCount helper
    jest.advanceTimersByTime(30 * 1000);

    await new Promise(r => setImmediate(r));
    expect(seHandler).toHaveBeenCalled();
  });

  it('reports the next track on a previously played player', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 1 stops, player 2 reports early
    feedState(1, {playState: CDJStatus.PlayState.Cued});

    expect(npHandler).toBeCalledTimes(1);
    npHandler.mockReset();

    // Player 1 loads a new track and begins playing
    feedState(1, {trackId: 456});
    feedState(1, {playState: CDJStatus.PlayState.Playing});
    expect(npHandler).not.toBeCalled();

    // 128 beats later player 1 should be reported
    advanceByBeatCount(128);
    feedState(1, {});

    expect(npHandler).toBeCalledWith(oc({deviceId: 1, trackId: 456}));
  });

  it('reports subsequent tracks when first deck is taken off-air and cued', () => {
    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 1 goes offair, then subsequently cues itself
    feedState(1, {isOnAir: false});
    advanceByBeatCount(2);
    feedState(1, {playState: CDJStatus.PlayState.Cued});

    expect(npHandler).toBeCalledTimes(1);
    npHandler.mockReset();

    // Player 1 loads a new track and begins playing
    feedState(1, {trackId: 456});
    feedState(1, {isOnAir: true, playState: CDJStatus.PlayState.Playing});
    expect(npHandler).not.toBeCalled();

    // 128 beats later player 1 should be reported
    advanceByBeatCount(128);
    feedState(1, {});

    expect(npHandler).toBeCalledWith(oc({deviceId: 1, trackId: 456}));
  });

  it('does not report after requiredPlayTime when reportRequresSilence', () => {
    processor.configure({reportRequresSilence: true});

    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 comes onair after 64 beats
    advanceByBeatCount(64);
    feedState(2, {isOnAir: true});

    // Player 2 stays onair. At beat 128 it is reported live.
    advanceByBeatCount(64);
    feedState(2, {});

    // Player 2 is NOT reported as live due to reportRequresSilence
    expect(npHandler).not.toHaveBeenCalled();

    // Player 1 stops and player 2 is reporte live
    feedState(1, {playState: CDJStatus.PlayState.Cued});

    expect(npHandler).toHaveBeenCalledTimes(1);
  });

  it('ignores isOnAir when hasOnAirCapabilities is false', () => {
    processor.configure({hasOnAirCapabilities: false});

    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 is reported live at beat 128 without having isOnAir set true
    advanceByBeatCount(128);
    feedState(2, {});

    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });

  it('reports for hasOnAirCapabilities:false + reportRequresSilence:true', () => {
    processor.configure({hasOnAirCapabilities: false, reportRequresSilence: true});

    const npHandler = jest.fn();
    processor.on('nowPlaying', npHandler);
    setupTwoTracks();
    npHandler.mockReset();

    // Player 2 is not reported since player 1 has not yet stopped
    advanceByBeatCount(128);
    feedState(2, {});

    expect(npHandler).not.toHaveBeenCalled();

    advanceByBeatCount(64);
    feedState(1, {playState: CDJStatus.PlayState.Cued});

    expect(npHandler).toBeCalledWith(oc({deviceId: 2, trackId: 234}));
  });
});
