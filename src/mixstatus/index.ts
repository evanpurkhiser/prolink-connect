import {EventEmitter} from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';

import {CDJStatus, DeviceID} from 'src/types';

import {isStopping, isPlaying} from './utils';
import {bpmToSeconds} from 'src/utils';

export type MixstatusConfig = {
  /**
   * Configures how many beats a track may not be live or playing for it to
   * still be considered active.
   *
   * @default 8 (two bars)
   */
  allowedInterruptBeats: number;
  /**
   * Configures how many beats the track must consecutively be playing for
   * (since the beat it was cued at) until the track is considered to be
   * active.
   *
   * @default 128 (2 phrases)
   */
  beatsUntilReported: number;
  /**
   * Specifies the duration in seconds that no tracks must be on air. This can
   * be thought of as how long 'air silence' is reasonable in a set before a
   * separate one is considered have begun.
   *
   * @default 30 (half a minute)
   */
  timeBetweenSets: number;
  /**
   * Indicates if the status objects reported have onAir capabilities. Setting
   * this to false will degrade the functionality of the processor.
   *
   * @default true
   */
  hasOnAirCapabilities: boolean;
};

const defaultConfig: MixstatusConfig = {
  allowedInterruptBeats: 8,
  beatsUntilReported: 128,
  timeBetweenSets: 30,
  hasOnAirCapabilities: true,
};

/**
 * The interface the mix status event emitter should follow
 */
type MixstatusEvents = {
  /**
   * Fired when a track is considered to be on-air and is being heard by the
   * audiance
   */
  nowPlaying: (state: CDJStatus.State) => void;
  /**
   * Fired when a track has stopped and is completley offair
   */
  stopped: (opt: {deviceId: DeviceID}) => void;
  /**
   * Fired when a DJ set first starts
   */
  setStarted: () => void;
  /**
   * Fired when tracks have been stopped
   */
  setEnded: () => void;
};

type Emitter = StrictEventEmitter<EventEmitter, MixstatusEvents>;

/**
 * MixstatusProcessor is a configurable processor which when fed device state
 * will attempt to accurately determine events that happen within the DJ set.
 *
 * The following events are fired:
 *
 * - nowPlaying: The track is considered playing and on air to the audience.
 * - stopped:    The track was stopped / paused / went off-air.
 *
 * Additionally the following non-track status are reported:
 *
 * - setStarted: The first track has begun playing.
 * - setEnded:   The TimeBetweenSets has passed since any tracks were live.
 *
 * See Config for configuration options.
 *
 * Config options may be changed after the processor has been created and is
 * actively receiving state updates.
 *
 * Track changes are detected based on a number of rules:
 *
 * - The track that has been in the play state with the CDJ in the "on air" state
 *   for the longest period of time (allowing for a configurable length of
 *   interruption with AllowedInterruptBeats) is considered to be the active
 *   track that incoming tracks will be compared against.
 *
 * - A incoming track will immediately be reported as nowPlaying if it is on
 *   air, playing, and the last active track has been cued.
 *
 * - A incoming track will be reported as nowPlaying if the active track has
 *   not been on air or has not been playing for the configured
 *   AllowedInterruptBeats.
 *
 * - A incoming track will be reported as nowPlaying if it has played
 *   consecutively (with AllowedInterruptBeats honored for the incoming track)
 *   for the configured BeatsUntilReported.
 *
 * - A track will be reported as stopped when it was NowPlaying and was stopped
 *   (cued, reached the end of the track, or a new track was loaded.
 */
export class MixstatusProcessor {
  /**
   * Used to fire track mix status events
   */
  #emitter: Emitter = new EventEmitter();
  /**
   * Records the most recent state of each player
   */
  #lastState = new Map<DeviceID, CDJStatus.State>();
  /**
   * Records when each device last started playing a track
   */
  #lastStartTime = new Map<DeviceID, number>();
  /**
   * Records when a device entered a 'may stop' state. If it's in the state for
   * long enough it will be reported as stopped.
   */
  #lastStoppedTimes = new Map<DeviceID, number>();
  /**
   * Records which players have been reported as 'live'
   */
  #livePlayers = new Set<DeviceID>();
  /**
   * Incidates if we're currentiny in an active DJ set
   */
  #isSetActive = false;
  /**
   * When we are waiting for a set to end, use this to cancel the timer.
   */
  #cancelSetEnding?: () => void;
  /**
   * The configuration for this instance of the processor
   */
  #config: MixstatusConfig;

  constructor(config?: Partial<MixstatusConfig>) {
    this.#config = {...defaultConfig, ...config};
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Report a player as 'live'. Will not report the state if the player has
   * already previously been reported as live.
   */
  #promotePlayer = (state: CDJStatus.State) => {
    const {deviceId} = state;

    if (!state.isOnAir) {
      return;
    }

    if (this.#livePlayers.has(deviceId)) {
      return;
    }

    if (!this.#isSetActive) {
      this.#isSetActive = true;
      this.#emitter.emit('setStarted');
    }

    if (this.#cancelSetEnding) {
      this.#cancelSetEnding();
    }

    this.#livePlayers.add(deviceId);

    this.#emitter.emit('nowPlaying', state);
  };

  /**
   * Locate the player that has been playing for the longest time and is onair,
   * and report that device as now playing.
   */
  #promoteNextPlayer = () => {
    const longestPlayingId = [...this.#lastStartTime.entries()]
      .map(([deviceId, startedAt]) => ({
        deviceId,
        startedAt,
        state: this.#lastState.get(deviceId),
      }))
      .filter(s => !this.#livePlayers.has(s.deviceId))
      .filter(s => s.state && isPlaying(s.state))
      .sort((a, b) => b.startedAt - a.startedAt)
      .pop()?.deviceId;

    // No other players currently playing?
    if (longestPlayingId === undefined) {
      this.#setMayStop();
      return;
    }

    // We know this value is available since we have a live player playing ID
    const nextPlayerState = this.#lastState.get(longestPlayingId)!;
    this.#promotePlayer(nextPlayerState);
  };

  #markPlayerStopped = ({deviceId}: CDJStatus.State) => {
    this.#lastStoppedTimes.delete(deviceId);
    this.#lastStartTime.delete(deviceId);
    this.#livePlayers.delete(deviceId);

    this.#promoteNextPlayer();
    this.#emitter.emit('stopped', {deviceId});
  };

  /**
   *
   */
  #setMayStop = async () => {
    // We handle the set ending interupt as a async timeout as in the case with
    // a set ending, the DJ may immediately turn off the CDJs, stopping state
    // packets meaning we can't process on a heartbeat.
    if (!this.#isSetActive) {
      return;
    }

    // If any tracks are still playing the set has not ended
    if ([...this.#lastState.values()].some(s => isPlaying(s) && s.isOnAir)) {
      return;
    }

    const shouldEnd = await new Promise<boolean>(resolve => {
      const endTimeout = setTimeout(
        () => resolve(true),
        this.#config.timeBetweenSets * 1000
      );
      this.#cancelSetEnding = () => {
        clearTimeout(endTimeout);
        resolve(false);
      };
    });

    this.#cancelSetEnding = undefined;

    if (!shouldEnd || !this.#isSetActive) {
      return;
    }

    this.#emitter.emit('setEnded');
  };

  /**
   * Called to indicate that we think this player may be the first one to start
   * playing. Will check if no other players are playing, if so it will report
   * the player as now playing.
   */
  #playerMayBeFirst = (state: CDJStatus.State) => {
    const otherPlayersPlaying = [...this.#lastState.values()]
      .filter(otherState => otherState.deviceId !== state.deviceId)
      .some(otherState => otherState.isOnAir && isPlaying(otherState));

    if (otherPlayersPlaying) {
      return;
    }

    this.#promotePlayer(state);
  };

  /**
   * Called when the player is in a state where it is no longer playing, but
   * may come back onair. Examples are slip pause, or 'cutting' a track on the
   * mixer taking it offair.
   */
  #playerMayStop = ({deviceId}: CDJStatus.State) => {
    this.#lastStoppedTimes.set(deviceId, Date.now());
  };

  /**
   * Called to indicate that a device has reported a different playState than
   * it had previously reported.
   */
  #handlePlaystateChange = (lastState: CDJStatus.State, state: CDJStatus.State) => {
    const {deviceId} = state;

    const nowPlaying = isPlaying(state);
    const wasPlaying = isPlaying(lastState);

    const isNowPlaying = nowPlaying && !wasPlaying;

    // Was this device in a 'may stop' state and it has begun on-air playing
    // again?
    if (this.#lastStoppedTimes.has(deviceId) && nowPlaying && state.isOnAir) {
      this.#lastStoppedTimes.delete(deviceId);
      return;
    }

    if (isNowPlaying) {
      this.#lastStartTime.set(deviceId, Date.now());
      this.#playerMayBeFirst(state);
      return;
    }

    if (wasPlaying && isStopping(state)) {
      this.#markPlayerStopped(state);
      return;
    }

    if (wasPlaying && !nowPlaying) {
      this.#playerMayStop(state);
    }
  };

  #handleOnairChange = (state: CDJStatus.State) => {
    const {deviceId} = state;

    // Player may have just been brought on with nothing else playing
    this.#playerMayBeFirst(state);

    if (!this.#livePlayers.has(deviceId)) {
      return;
    }

    if (!state.isOnAir) {
      this.#playerMayStop(state);
      return;
    }

    // Play has come back onair
    this.#lastStoppedTimes.delete(deviceId);
  };

  /**
   * Feed a CDJStatus state object to the mix state processor
   */
  handleState(state: CDJStatus.State) {
    const {deviceId, playState, isOnAir} = state;

    const lastState = this.#lastState.get(deviceId);
    this.#lastState.set(deviceId, state);

    // If this is the first time we've heard from this CDJ, and it is on air
    // and playing, report it immediately. This is different from reporting the
    // first playing track, as the CDJ will have already sent many states.
    if (lastState === undefined && isOnAir && isPlaying(state)) {
      this.#lastStartTime.set(deviceId, Date.now());
      this.#playerMayBeFirst(state);
      return;
    }

    // Play state has changed since this play last reported
    if (lastState && lastState.playState !== playState) {
      this.#handlePlaystateChange(lastState, state);
    }

    if (lastState && lastState.isOnAir !== state.isOnAir) {
      this.#handleOnairChange(state);
    }

    // If a device has been playing for the required number of beats, we may be
    // able to report it as live
    const startedAt = this.#lastStartTime.get(deviceId);
    const requiredPlayTime =
      this.#config.beatsUntilReported *
      bpmToSeconds(state.trackBPM!, state.sliderPitch) *
      1000;

    if (startedAt !== undefined && requiredPlayTime <= Date.now() - startedAt) {
      this.#promotePlayer(state);
    }

    // If a device has been in a 'potentially stopped' state for long enough,
    // we can mark the track as truely stopped.
    const stoppedAt = this.#lastStoppedTimes.get(deviceId);
    const requiredStopTime =
      this.#config.allowedInterruptBeats *
      bpmToSeconds(state.trackBPM!, state.sliderPitch) *
      1000;

    if (stoppedAt !== undefined && requiredStopTime <= Date.now() - stoppedAt) {
      this.#markPlayerStopped(state);
    }
  }
}
