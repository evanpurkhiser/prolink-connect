import StrictEventEmitter from 'strict-event-emitter-types';

import {EventEmitter} from 'events';

import {CDJStatus, DeviceID, MixstatusMode} from 'src/types';
import {bpmToSeconds} from 'src/utils';

import {isPlaying, isStopping} from './utils';

export interface MixstatusConfig {
  /**
   * Selects the mixstatus reporting mode
   */
  mode: MixstatusMode;
  /**
   * Specifies the duration in seconds that no tracks must be on air. This can
   * be thought of as how long 'air silence' is reasonable in a set before a
   * separate one is considered have begun.
   *
   * @default 30 (half a minute)
   */
  timeBetweenSets: number;
  /**
   * Indicates if the status objects reported should have their on-air flag
   * read. Setting this to false will degrade the functionality of the processor
   * such that it will not consider the value of isOnAir and always assume CDJs
   * are live.
   *
   * @default true
   */
  useOnAirStatus: boolean;
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
   * Used for MixstatusMode.SmartTiming
   *
   * @default 128 (2 phrases)
   */
  beatsUntilReported: number;
}

const defaultConfig: MixstatusConfig = {
  mode: MixstatusMode.SmartTiming,
  timeBetweenSets: 30,
  allowedInterruptBeats: 8,
  beatsUntilReported: 128,
  useOnAirStatus: true,
};

/**
 * The interface the mix status event emitter should follow
 */
interface MixstatusEvents {
  /**
   * Fired when a track is considered to be on-air and is being heard by the
   * audience
   */
  nowPlaying: (state: CDJStatus.State) => void;
  /**
   * Fired when a track has stopped and is completely offair
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
}

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

  /**
   * Update the configuration
   */
  configure(config?: Partial<MixstatusConfig>) {
    this.#config = {...this.#config, ...config};
  }

  // Bind public event emitter interface
  on: Emitter['on'] = this.#emitter.addListener.bind(this.#emitter);
  off: Emitter['off'] = this.#emitter.removeListener.bind(this.#emitter);
  once: Emitter['once'] = this.#emitter.once.bind(this.#emitter);

  /**
   * Helper to account for the useOnAirStatus config. If not configured
   * with this flag the state will always be determined as on air.
   */
  #onAir = (state: CDJStatus.State) =>
    this.#config.useOnAirStatus ? state.isOnAir : true;

  /**
   * Report a player as 'live'. Will not report the state if the player has
   * already previously been reported as live.
   */
  #promotePlayer = (state: CDJStatus.State) => {
    const {deviceId} = state;

    if (!this.#onAir(state) || !isPlaying(state)) {
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

  #setMayStop = async () => {
    // We handle the set ending interrupt as a async timeout as in the case with
    // a set ending, the DJ may immediately turn off the CDJs, stopping state
    // packets meaning we can't process on a heartbeat.
    if (!this.#isSetActive) {
      return;
    }

    // If any tracks are still playing the set has not ended
    if ([...this.#lastState.values()].some(s => isPlaying(s) && this.#onAir(s))) {
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
      .some(otherState => this.#onAir(otherState) && isPlaying(otherState));

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

    const isFollowingMaster =
      this.#config.mode === MixstatusMode.FollowsMaster && state.isMaster;

    const nowPlaying = isPlaying(state);
    const wasPlaying = isPlaying(lastState);

    const isNowPlaying = nowPlaying && !wasPlaying;

    // Was this device in a 'may stop' state and it has begun on-air playing
    // again?
    if (this.#lastStoppedTimes.has(deviceId) && nowPlaying && this.#onAir(state)) {
      this.#lastStoppedTimes.delete(deviceId);
      return;
    }

    if (isNowPlaying && isFollowingMaster) {
      this.#promotePlayer(state);
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

    if (!this.#onAir(state)) {
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
    const {deviceId, playState} = state;

    const lastState = this.#lastState.get(deviceId);
    this.#lastState.set(deviceId, state);

    // If this is the first time we've heard from this CDJ, and it is on air
    // and playing, report it immediately. This is different from reporting the
    // first playing track, as the CDJ will have already sent many states.
    if (lastState === undefined && this.#onAir(state) && isPlaying(state)) {
      this.#lastStartTime.set(deviceId, Date.now());
      this.#playerMayBeFirst(state);
      return;
    }

    // Play state has changed since this play last reported
    if (lastState && lastState.playState !== playState) {
      this.#handlePlaystateChange(lastState, state);
    }

    if (lastState && this.#onAir(lastState) !== this.#onAir(state)) {
      this.#handleOnairChange(state);
    }

    // Are we simply following master?
    if (
      this.#config.mode === MixstatusMode.FollowsMaster &&
      lastState?.isMaster === false &&
      state.isMaster
    ) {
      this.#promotePlayer(state);
      return;
    }

    // If a device has been playing for the required number of beats, we may be
    // able to report it as live
    const startedAt = this.#lastStartTime.get(deviceId);
    const requiredPlayTime =
      this.#config.beatsUntilReported *
      bpmToSeconds(state.trackBPM!, state.sliderPitch) *
      1000;

    if (
      this.#config.mode === MixstatusMode.SmartTiming &&
      startedAt !== undefined &&
      requiredPlayTime <= Date.now() - startedAt
    ) {
      this.#promotePlayer(state);
    }

    // If a device has been in a 'potentially stopped' state for long enough,
    // we can mark the track as truly stopped.
    const stoppedAt = this.#lastStoppedTimes.get(deviceId);
    const requiredStopTime =
      this.#config.allowedInterruptBeats *
      bpmToSeconds(state.trackBPM!, state.sliderPitch) *
      1000;

    if (stoppedAt !== undefined && requiredStopTime <= Date.now() - stoppedAt) {
      this.#markPlayerStopped(state);
    }
  }

  /**
   * Manually reports the track that has been playing the longest which has not
   * yet been reported as live.
   */
  triggerNextTrack() {
    this.#promoteNextPlayer();
  }
}
