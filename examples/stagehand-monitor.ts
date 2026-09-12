/**
 * Stagehand Monitor
 *
 * Joins the Pro DJ Link network posing as the Pioneer Stagehand iOS app and
 * prints everything the hardware sends back: device announcements, player
 * status, media slots, mixer on-air flags, Stagehand-only mixer fader/EQ state
 * (0x39) and VU levels (0x58), and CDJ-3000 absolute position.
 *
 * It also drives a player over the Stagehand control protocol so the write
 * side can be exercised against real or emulated gear: single keys on a TTY,
 * or one command per line when stdin is piped.
 *
 * Build & run (examples are bundled by webpack, like the CLI):
 *   yarn build
 *   node lib/examples/stagehand-monitor.js [options]
 *
 * Options:
 *   --iface <name|ip>   Interface to join on. Default: wait for the first peer
 *                       announcement and use the interface that matches it.
 *   --id <141-211>      Stagehand device number. Default: random in range.
 *                       Pin it across restarts: a CDJ-3000 records the peer by
 *                       identity and ignores a differing number from the same
 *                       IP, so a fresh random number on a re-run may never get
 *                       the status stream until the player next reboots.
 *   --name <name>       Announced device name. Default: "Stagehand".
 *   --player <1-6>      Player targeted by keyboard commands. Default: the
 *                       first CDJ discovered.
 *   --json              One JSON object per line instead of text.
 *   --verbose           Library debug logging (announcer stages, heartbeats)
 *                       and every status packet, not only changes.
 *   --quiet             Suppress the high-rate streams (position, vu,
 *                       mixerState); they still count in the periodic summary.
 *
 * Commands (key on a TTY / line on a pipe):
 *   p        play            c or space  pause (cue)
 *   ]        seek-forward    [           seek-backward   (300 ms hold)
 *   n        skip
 *   o / O    on-air on / on-air off      (0x6b preference write)
 *   1-6      player <n>                  (select target player)
 *   q        quit
 *
 *   printf 'play\n' | node lib/examples/stagehand-monitor.js --player 1
 */

import {NetworkInterfaceInfoIPv4, networkInterfaces} from 'os';

import {Logger} from 'src/logger';
import {bringOnlineStagehand, NetworkConfig, ProlinkNetwork} from 'src/network';
import {CDJStatus, Device, DeviceType, MediaSlot, TrackType} from 'src/types';
import {getMatchingInterface} from 'src/utils';

interface Options {
  iface?: string;
  id?: number;
  name?: string;
  player?: number;
  json: boolean;
  verbose: boolean;
  quiet: boolean;
}

const HIGH_RATE_PRINT_INTERVAL = 1000;
const SUMMARY_INTERVAL = 5000;
const HOLD_DURATION = 300;

function parseArgs(argv: string[]): Options {
  const opts: Options = {json: false, verbose: false, quiet: false};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(`${arg} requires a value`);
      }
      return value;
    };

    switch (arg) {
      case '--iface':
        opts.iface = next();
        break;
      case '--id':
        opts.id = parseInt(next(), 10);
        break;
      case '--name':
        opts.name = next();
        break;
      case '--player':
        opts.player = parseInt(next(), 10);
        break;
      case '--json':
        opts.json = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--quiet':
        opts.quiet = true;
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: stagehand-monitor [--iface <name|ip>] [--id <141-211>] [--name <name>] [--player <1-6>] [--json] [--verbose] [--quiet]'
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function resolveIface(hint: string): NetworkInterfaceInfoIPv4 {
  const all = networkInterfaces();
  for (const [name, infos] of Object.entries(all)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) {
        continue;
      }
      if (name === hint || info.address === hint) {
        return info;
      }
    }
  }

  const available = Object.entries(all)
    .flatMap(([name, infos]) =>
      (infos ?? [])
        .filter(i => i.family === 'IPv4' && !i.internal)
        .map(i => `${name}:${i.address}`)
    )
    .join(', ');
  throw new Error(`Unable to resolve iface "${hint}". Available: ${available}`);
}

const DEVICE_TYPE_NAMES: Record<number, string> = {
  [DeviceType.CDJ]: 'CDJ',
  [DeviceType.Mixer]: 'Mixer',
  [DeviceType.Rekordbox]: 'Rekordbox',
  [DeviceType.Stagehand]: 'Stagehand',
};

const deviceTypeName = (type: DeviceType) =>
  DEVICE_TYPE_NAMES[type] ?? `0x${type.toString(16)}`;

const describeDevice = (d: Device) =>
  `#${d.id} ${d.name} [${deviceTypeName(d.type)}] ${d.ip.address}`;

const formatMac = (mac: Uint8Array) =>
  Array.from(mac)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':');

const timestamp = () => new Date().toISOString().slice(11, 23);

/**
 * Prints events either as aligned text lines or as JSON lines.
 */
class Printer {
  #json: boolean;

  constructor(json: boolean) {
    this.#json = json;
  }

  event(name: string, text: string, data: Record<string, unknown> = {}) {
    if (this.#json) {
      console.log(JSON.stringify({ts: new Date().toISOString(), event: name, ...data}));
      return;
    }
    console.log(`${timestamp()} ${name.padEnd(12)} ${text}`);
  }
}

/**
 * Counts packets per event so the periodic summary can report rates even when
 * the high-rate streams are not printed.
 */
class Counters {
  #counts = new Map<string, number>();
  #since = Date.now();

  bump(name: string) {
    this.#counts.set(name, (this.#counts.get(name) ?? 0) + 1);
  }

  flush(): {elapsed: number; counts: Record<string, number>} {
    const elapsed = Date.now() - this.#since;
    const counts = Object.fromEntries(this.#counts);
    this.#counts.clear();
    this.#since = Date.now();
    return {elapsed, counts};
  }
}

function makeLogger(printer: Printer, verbose: boolean): Logger {
  const emit = (level: string, msg: string, args: unknown[]) =>
    printer.event(`lib:${level}`, [msg, ...args.map(String)].join(' '), {msg, args});

  return {
    trace: (msg, ...args) => verbose && emit('trace', msg, args),
    debug: (msg, ...args) => verbose && emit('debug', msg, args),
    info: (msg, ...args) => emit('info', msg, args),
    warn: (msg, ...args) => emit('warn', msg, args),
    error: (msg, ...args) => emit('error', msg, args),
  };
}

/**
 * The subset of a status packet that is worth a line when it changes. Beat
 * counters and packet numbers tick constantly and are left to --verbose.
 */
function statusSummary(s: CDJStatus.State) {
  return {
    playState: CDJStatus.PlayState[s.playState] ?? `0x${s.playState.toString(16)}`,
    track: `${s.trackDeviceId}/${MediaSlot[s.trackSlot] ?? s.trackSlot}/${TrackType[s.trackType] ?? s.trackType}/${s.trackId}`,
    bpm: s.trackBPM,
    pitch: Number(s.effectivePitch.toFixed(2)),
    onAir: s.isOnAir,
    master: s.isMaster,
    sync: s.isSync,
    emergency: s.isEmergencyMode,
  };
}

function formatStatus(s: CDJStatus.State) {
  const v = statusSummary(s);
  const flags = [
    v.onAir && 'ON-AIR',
    v.master && 'MASTER',
    v.sync && 'SYNC',
    v.emergency && 'EMERGENCY',
  ]
    .filter(Boolean)
    .join(' ');
  const bpm = v.bpm === null ? '---' : v.bpm.toFixed(2);
  return `#${s.deviceId} ${v.playState.padEnd(11)} track=${v.track} bpm=${bpm} pitch=${v.pitch >= 0 ? '+' : ''}${v.pitch}% beat=${s.beat ?? '-'}/${s.beatInMeasure} ${flags}`;
}

function formatMixerState(m: CDJStatus.MixerState) {
  const channels = Object.entries(m.channels)
    .map(
      ([ch, c]) =>
        `ch${ch}[fader=${c.fader.toFixed(2)} trim=${c.trim.toFixed(2)} eq=${c.eqHi.toFixed(2)}/${c.eqMid.toFixed(2)}/${c.eqLow.toFixed(2)} fx=${c.colorFx.toFixed(2)} xf=${c.crossfaderAssign}]`
    )
    .join(' ');
  return `#${m.deviceId} ${m.deviceName} xfader=${m.crossfader.toFixed(2)} ${channels}`;
}

function formatVu(v: CDJStatus.VUState) {
  const channels = Object.entries(v.channels)
    .map(([ch, frames]) => {
      const latest = frames[frames.length - 1];
      return latest ? `ch${ch}=${latest.left}/${latest.right}` : `ch${ch}=-`;
    })
    .join(' ');
  return `#${v.deviceId} ${channels}`;
}

function formatPosition(p: CDJStatus.PositionState) {
  const secs = p.playhead / 1000;
  const mm = Math.floor(secs / 60);
  const ss = (secs % 60).toFixed(2).padStart(5, '0');
  return `#${p.deviceId} ${mm}:${ss} / ${p.trackLength}s pitch=${p.pitch.toFixed(2)}% bpm=${p.bpm ?? '-'}`;
}

/**
 * Commands understood on stdin. From a TTY each is bound to a single key; when
 * stdin is a pipe they are read one per line, which makes the write side
 * scriptable (`printf 'play\n' | node lib/examples/stagehand-monitor.js`).
 */
type Command =
  | 'play'
  | 'pause'
  | 'seek-forward'
  | 'seek-backward'
  | 'skip'
  | 'on-air on'
  | 'on-air off'
  | `player ${number}`
  | 'quit';

const KEY_BINDINGS: Record<string, Command> = {
  p: 'play',
  c: 'pause',
  ' ': 'pause',
  ']': 'seek-forward',
  '[': 'seek-backward',
  n: 'skip',
  o: 'on-air on',
  O: 'on-air off',
  '1': 'player 1',
  '2': 'player 2',
  '3': 'player 3',
  '4': 'player 4',
  '5': 'player 5',
  '6': 'player 6',
  q: 'quit',
  '\u0003': 'quit',
};

/**
 * Drives the target player over the Stagehand control protocol.
 */
class Commander {
  #network: ProlinkNetwork;
  #printer: Printer;
  #target: {player: number | undefined};
  #shutdown: () => Promise<void>;

  constructor(
    network: ProlinkNetwork,
    printer: Printer,
    target: {player: number | undefined},
    shutdown: () => Promise<void>
  ) {
    this.#network = network;
    this.#printer = printer;
    this.#target = target;
    this.#shutdown = shutdown;
  }

  /**
   * Reads commands from stdin: single keys on a TTY, lines otherwise.
   */
  listen() {
    const stdin = process.stdin;
    stdin.setEncoding('utf8');
    stdin.resume();

    if (stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.on('data', (key: string) => {
        const command = KEY_BINDINGS[key];
        if (command !== undefined) {
          void this.run(command);
        }
      });
      return;
    }

    let buffered = '';
    stdin.on('data', (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        const text = line.trim();
        if (text !== '' && !text.startsWith('#')) {
          void this.run(text as Command);
        }
      }
    });
  }

  async run(command: Command) {
    const control = this.#network.control;
    if (control === null) {
      return;
    }

    try {
      switch (command) {
        case 'play':
          await this.#send(command, d => control.play(d));
          break;
        case 'pause':
          await this.#send(command, d => control.pause(d));
          break;
        case 'seek-forward':
          await this.#hold(command, (d, press) => control.seekForward(d, press));
          break;
        case 'seek-backward':
          await this.#hold(command, (d, press) => control.seekBackward(d, press));
          break;
        case 'skip':
          await this.#hold(command, (d, press) => control.skip(d, press));
          break;
        case 'on-air on':
          await this.#send(command, d => control.setPreference(d, {onAir: 'on'}));
          break;
        case 'on-air off':
          await this.#send(command, d => control.setPreference(d, {onAir: 'off'}));
          break;
        case 'quit':
          await this.#shutdown();
          break;
        default: {
          const match = /^player (\d+)$/.exec(command);
          if (match === null) {
            this.#printer.event('control', `unknown command "${command}"`, {command});
            break;
          }
          this.#target.player = parseInt(match[1], 10);
          this.#printer.event('control', `target player = #${this.#target.player}`, {
            player: this.#target.player,
          });
        }
      }
    } catch (err) {
      this.#printer.event(
        'control',
        `${command} failed: ${err instanceof Error ? err.message : err}`,
        {
          command,
        }
      );
    }
  }

  #targetDevice(): Device | null {
    const device =
      this.#target.player === undefined
        ? null
        : (this.#network.deviceManager.devices.get(this.#target.player) ?? null);
    if (device === null) {
      this.#printer.event(
        'control',
        `no target player (seen: ${listPlayers(this.#network)})`
      );
    }
    return device;
  }

  async #send(name: string, fn: (device: Device) => Promise<void>) {
    const device = this.#targetDevice();
    if (device === null) {
      return;
    }
    this.#printer.event('control', `${name} -> ${describeDevice(device)}`, {
      command: name,
      player: device.id,
    });
    await fn(device);
  }

  async #hold(name: string, fn: (device: Device, press: boolean) => Promise<void>) {
    const device = this.#targetDevice();
    if (device === null) {
      return;
    }
    this.#printer.event('control', `${name} press -> ${describeDevice(device)}`, {
      command: name,
      press: true,
      player: device.id,
    });
    await fn(device, true);
    await new Promise(r => setTimeout(r, HOLD_DURATION));
    this.#printer.event('control', `${name} release -> ${describeDevice(device)}`, {
      command: name,
      press: false,
      player: device.id,
    });
    await fn(device, false);
  }
}

const listPlayers = (network: ProlinkNetwork) =>
  Array.from(network.deviceManager.devices.values())
    .filter(d => d.type === DeviceType.CDJ)
    .map(d => `#${d.id}`)
    .join(', ') || 'none';

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const printer = new Printer(opts.json);
  const counters = new Counters();
  const logger = makeLogger(printer, opts.verbose);

  // The interface is filled in by configure() below, once we know it.
  const network = await bringOnlineStagehand({
    vcdjId: opts.id,
    vcdjName: opts.name,
    logger,
  } as Omit<NetworkConfig, 'connectMethod'>);

  const dm = network.deviceManager;
  const target = {player: opts.player};

  dm.on('connected', device => {
    counters.bump('connected');
    printer.event(
      'connected',
      `${describeDevice(device)} mac=${formatMac(device.macAddr)}`,
      {
        id: device.id,
        name: device.name,
        type: deviceTypeName(device.type),
        ip: device.ip.address,
        mac: formatMac(device.macAddr),
      }
    );
    if (target.player === undefined && device.type === DeviceType.CDJ) {
      target.player = device.id;
      printer.event('control', `target player = #${device.id}`, {player: device.id});
    }
  });

  dm.on('disconnected', device => {
    counters.bump('disconnected');
    printer.event('disconnected', describeDevice(device), {
      id: device.id,
      name: device.name,
    });
  });

  dm.on('announced', device => {
    counters.bump('announced');
    if (opts.verbose) {
      printer.event('announced', describeDevice(device), {
        id: device.id,
        name: device.name,
      });
    }
  });

  // Interface selection
  if (opts.iface !== undefined) {
    network.configure({iface: resolveIface(opts.iface)});
  } else {
    printer.event('setup', 'waiting for a peer announcement to pick the interface...');
    const first = await new Promise<Device>(resolve => dm.once('connected', resolve));
    const iface = getMatchingInterface(first.ip);
    if (iface === null) {
      throw new Error(`No local interface matches ${first.ip.address}`);
    }
    network.configure({iface});
  }

  network.connect();
  if (!network.isConnected()) {
    throw new Error('Failed to connect');
  }

  printer.event(
    'setup',
    `joined as Stagehand${opts.name ? ` "${opts.name}"` : ''}; commands from ${process.stdin.isTTY ? 'keyboard' : 'stdin lines'}`
  );

  network.startupReady.then(() =>
    printer.event('setup', 'Stagehand join sequence complete (keep-alive running)')
  );

  // Status: print on change (or every packet with --verbose)
  const lastStatus = new Map<number, string>();
  network.statusEmitter.on('status', s => {
    counters.bump('status');
    const summary = JSON.stringify(statusSummary(s));
    if (!opts.verbose && lastStatus.get(s.deviceId) === summary) {
      return;
    }
    lastStatus.set(s.deviceId, summary);
    printer.event('status', formatStatus(s), {...s});
  });

  network.statusEmitter.on('mediaSlot', info => {
    counters.bump('mediaSlot');
    printer.event(
      'mediaSlot',
      `#${info.deviceId} slot=${MediaSlot[info.slot] ?? info.slot} name="${info.name}" tracks=${info.trackCount} free=${info.freeBytes}/${info.totalBytes}`,
      {
        ...info,
        freeBytes: info.freeBytes.toString(),
        totalBytes: info.totalBytes.toString(),
      }
    );
  });

  const lastOnAir = new Map<number, string>();
  network.statusEmitter.on('onAir', status => {
    counters.bump('onAir');
    const summary = JSON.stringify(status.channels);
    if (!opts.verbose && lastOnAir.get(status.deviceId) === summary) {
      return;
    }
    lastOnAir.set(status.deviceId, summary);
    const channels = Object.entries(status.channels)
      .map(([ch, on]) => `ch${ch}=${on ? 'ON' : 'off'}`)
      .join(' ');
    printer.event(
      'onAir',
      `#${status.deviceId} ${channels}${status.isSixChannel ? ' (6ch)' : ''}`,
      {...status}
    );
  });

  // Mixer state: 4 Hz stream, print only when a value moves
  const lastMixer = new Map<number, string>();
  network.statusEmitter.on('mixerState', m => {
    counters.bump('mixerState');
    if (opts.quiet) {
      return;
    }
    const summary = JSON.stringify({c: m.channels, x: m.crossfader});
    if (!opts.verbose && lastMixer.get(m.deviceId) === summary) {
      return;
    }
    lastMixer.set(m.deviceId, summary);
    printer.event('mixerState', formatMixerState(m), {...m});
  });

  // VU and position: ~30 Hz streams, throttled to one line per second per device
  const lastVuPrint = new Map<number, number>();
  network.positionEmitter.on('vu', v => {
    counters.bump('vu');
    if (opts.quiet) {
      return;
    }
    const now = Date.now();
    if (
      !opts.verbose &&
      now - (lastVuPrint.get(v.deviceId) ?? 0) < HIGH_RATE_PRINT_INTERVAL
    ) {
      return;
    }
    lastVuPrint.set(v.deviceId, now);
    printer.event('vu', formatVu(v), {...v});
  });

  const lastPosPrint = new Map<number, number>();
  network.positionEmitter.on('position', p => {
    counters.bump('position');
    if (opts.quiet) {
      return;
    }
    const now = Date.now();
    if (
      !opts.verbose &&
      now - (lastPosPrint.get(p.deviceId) ?? 0) < HIGH_RATE_PRINT_INTERVAL
    ) {
      return;
    }
    lastPosPrint.set(p.deviceId, now);
    printer.event('position', formatPosition(p), {...p});
  });

  // Periodic summary of packet rates and known devices
  const summaryTimer = setInterval(() => {
    const {elapsed, counts} = counters.flush();
    const rates = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, n]) => `${name}=${(n / (elapsed / 1000)).toFixed(1)}/s`)
      .join(' ');
    const devices =
      Array.from(dm.devices.values()).map(describeDevice).join('; ') || 'none';
    printer.event(
      'summary',
      `${rates || 'no packets'} | devices: ${devices} | target: ${target.player === undefined ? '-' : `#${target.player}`}`,
      {
        elapsedMs: elapsed,
        counts,
        devices: Array.from(dm.devices.values()).map(d => ({
          id: d.id,
          name: d.name,
          type: deviceTypeName(d.type),
          ip: d.ip.address,
        })),
        target: target.player ?? null,
      }
    );
  }, SUMMARY_INTERVAL);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(summaryTimer);
    printer.event('setup', 'disconnecting');
    network.disconnect();
    await network.close();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  new Commander(network, printer, target, shutdown).listen();
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
