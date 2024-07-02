import * as Sentry from '@sentry/node';
import {SpanStatus} from '@sentry/tracing';

import {randomUUID} from 'crypto';
import dgram, {Socket} from 'dgram';
import {NetworkInterfaceInfoIPv4} from 'os';

import {ANNOUNCE_PORT, BEAT_PORT, DEFAULT_VCDJ_ID, STATUS_PORT} from 'src/constants';
import Control from 'src/control';
import Database from 'src/db';
import DeviceManager from 'src/devices';
import LocalDatabase from 'src/localdb';
import {MixstatusProcessor} from 'src/mixstatus';
import RemoteDatabase from 'src/remotedb';
import StatusEmitter from 'src/status';
import {Device, NetworkState} from 'src/types';
import {getMatchingInterface} from 'src/utils';
import {udpBind, udpClose} from 'src/utils/udp';
import {Announcer, getVirtualCDJ} from 'src/virtualcdj';

const connectErrorHelp =
  'Network must be configured. Try using `autoconfigFromPeers` or `configure`';

export interface NetworkConfig {
  /**
   * The network interface to listen for devices on the network over
   */
  iface: NetworkInterfaceInfoIPv4;
  /**
   * The ID of the virtual CDJ to pose as.
   *
   * IMPORTANT:
   *
   * You will likely want to configure this to be > 6, however it is important to
   * note, if you choose an ID within the 1-6 range, no other CDJ may exist on the
   * network using that ID. you CAN NOT have 6 CDJs if you're using one of their slots.
   *
   * However, should you want to make metadata queries to a unanalized media
   * device connected to the CDJ, or metadata queries for CD disc data, you MUST
   * use a ID within the 1-6 range, as the CDJs will not respond to metadata
   * requests outside of the range of 1-6
   *
   * Note that rekordbox analyzed media connected to the CDJ is accessed out of
   * band of the networks remote database protocol, and is not limited by this
   * restriction.
   */
  vcdjId: number;
}

interface ConnectionService {
  announcer: Announcer;
  control: Control;
  remotedb: RemoteDatabase;
  localdb: LocalDatabase;
  database: Database;
}

interface ConstructOpts {
  config?: NetworkConfig;
  announceSocket: Socket;
  beatSocket: Socket;
  statusSocket: Socket;
  deviceManager: DeviceManager;
  statusEmitter: StatusEmitter;
}

/**
 * Services that are not accessible until connected
 */
type ConnectedServices =
  | 'statusEmitter'
  | 'control'
  | 'db'
  | 'localdb'
  | 'remotedb'
  | 'mixstatus';

export type ConnectedProlinkNetwork = ProlinkNetwork & {
  [P in ConnectedServices]: NonNullable<ProlinkNetwork[P]>;
} & {
  state: NetworkState.Connected;
  isConfigured: true;
};

/**
 * Brings the Prolink network online.
 *
 * This is the primary entrypoint for connecting to the prolink network.
 */
export async function bringOnline(config?: NetworkConfig) {
  Sentry.setTag('connectionId', randomUUID());
  const tx = Sentry.startTransaction({name: 'bringOnline'});

  // Socket used to listen for devices on the network
  const announceSocket = dgram.createSocket('udp4');

  // Socket used to listen for beat timing information
  const beatSocket = dgram.createSocket('udp4');

  // Socket used to listen for status packets
  const statusSocket = dgram.createSocket('udp4');

  try {
    await udpBind(announceSocket, ANNOUNCE_PORT, '0.0.0.0');
    await udpBind(beatSocket, BEAT_PORT, '0.0.0.0');
    await udpBind(statusSocket, STATUS_PORT, '0.0.0.0');
  } catch (err) {
    Sentry.captureException(err);
    tx.setStatus(SpanStatus.Unavailable);
    tx.finish();

    throw err;
  }

  const deviceManager = new DeviceManager(announceSocket);
  const statusEmitter = new StatusEmitter(statusSocket);

  tx.finish();

  const network = new ProlinkNetwork({
    config,
    announceSocket,
    beatSocket,
    statusSocket,
    deviceManager,
    statusEmitter,
  });

  return network;
}

export class ProlinkNetwork {
  #state: NetworkState = NetworkState.Online;

  #announceSocket: Socket;
  #beatSocket: Socket;
  #statusSocket: Socket;
  #deviceManager: DeviceManager;
  #statusEmitter: StatusEmitter;

  #config: null | NetworkConfig;
  #connection: null | ConnectionService;
  #mixstatus: null | MixstatusProcessor;

  /**
   * @internal
   */
  constructor({
    config,
    announceSocket,
    beatSocket,
    statusSocket,
    deviceManager,
    statusEmitter,
  }: ConstructOpts) {
    this.#config = config ?? null;

    this.#announceSocket = announceSocket;
    this.#beatSocket = beatSocket;
    this.#statusSocket = statusSocket;
    this.#deviceManager = deviceManager;
    this.#statusEmitter = statusEmitter;

    this.#connection = null;
    this.#mixstatus = null;

    // We always start online when constructing the network
    this.#state = NetworkState.Online;
  }

  /**
   * Configure / reconfigure the network with an explicit configuration.
   *
   * You may need to disconnect and re-connect the network after making a
   * networking configuration change.
   */
  configure(config: NetworkConfig) {
    this.#config = {...this.#config, ...config};
  }

  /**
   * Wait for another device to show up on the network to determine which network
   * interface to listen on.
   *
   * Defaults the Virtual CDJ ID to 5.
   */
  async autoconfigFromPeers() {
    const tx = Sentry.startTransaction({name: 'autoConfigure'});
    // wait for first device to appear on the network
    const firstDevice = await new Promise<Device>(resolve =>
      this.#deviceManager.once('connected', resolve)
    );
    const iface = getMatchingInterface(firstDevice.ip);

    // Log addr and iface addr / mask for cases where it may have matched the
    // wrong interface
    tx.setTag('deviceName', firstDevice.name);
    tx.setData('deviceAddr', firstDevice.ip.address);
    tx.setData('ifaceAddr', iface?.address);

    if (iface === null) {
      tx.setStatus(SpanStatus.InternalError);
      tx.setTag('noIfaceFound', 'yes');
      tx.finish();

      throw new Error('Unable to determine network interface');
    }

    this.#config = {...this.#config, vcdjId: DEFAULT_VCDJ_ID, iface};
    tx.finish();
  }

  /**
   * Connect to the network.
   *
   * The network must first have been configured (either with autoconfigFromPeers
   * or manual configuration). This will then initialize all the network services.
   */
  connect() {
    if (this.#config === null) {
      throw new Error(connectErrorHelp);
    }

    const tx = Sentry.startTransaction({name: 'connect'});

    // Create VCDJ for the interface's broadcast address
    const vcdj = getVirtualCDJ(this.#config.iface, this.#config.vcdjId);

    // Start announcing
    const announcer = new Announcer(vcdj, this.#announceSocket, this.deviceManager);
    announcer.start();

    // Create remote and local databases
    const remotedb = new RemoteDatabase(this.#deviceManager, vcdj);
    const localdb = new LocalDatabase(vcdj, this.#deviceManager, this.#statusEmitter);

    // Create unified database
    const database = new Database(vcdj, localdb, remotedb, this.#deviceManager);

    // Create controller service
    const control = new Control(this.#beatSocket, vcdj);

    this.#state = NetworkState.Connected;
    this.#connection = {announcer, control, remotedb, localdb, database};

    tx.finish();
  }

  /**
   * Disconnect from the network
   */
  disconnect() {
    if (this.#config === null) {
      throw new Error(connectErrorHelp);
    }

    // Stop announcing ourself
    this.#connection?.announcer.stop();

    // Disconnect devices from the remote and local databases
    for (const device of this.deviceManager.devices.values()) {
      this.remotedb?.disconnectFromDevice(device);
      this.localdb?.disconnectForDevice(device);
    }

    return Promise.all([
      udpClose(this.#announceSocket),
      udpClose(this.#statusSocket),
      udpClose(this.#beatSocket),
    ]);
  }

  /**
   * Get the current NetworkState of the network.
   *
   * When the network is Online you may use the deviceManager to list and react to
   * devices on the nettwork
   *
   * Once the network is Connected you may use the statusEmitter to listen for
   * player status events, query the media databases of devices using the db
   * service (or specifically query the localdb or remotedb).
   */
  get state() {
    return this.#state;
  }

  /**
   * Check if the network has been configured. You cannot connect to the network
   * until it has been configured.
   */
  get isConfigured() {
    return this.#config !== null;
  }

  /**
   * Typescript discriminate helper. Refines the type of the network to one
   * that reflects the connected status. Useful to avoid having to gaurd the
   * service getters from nulls.
   */
  isConnected(): this is ConnectedProlinkNetwork {
    return this.#state === NetworkState.Connected;
  }

  /**
   * Get the {@link DeviceManager} service. This service is used to monitor and
   * react to devices connecting and disconnecting from the prolink network.
   */
  get deviceManager() {
    return this.#deviceManager;
  }

  /**
   * Get the {@link StatusEmitter} service. This service is used to monitor
   * status updates on each CDJ.
   */
  get statusEmitter() {
    // Even though the status emitter service does not need to wait for the
    // network to be Connected, it does not make sense to use it unless it is. So
    // we artificially return null if we are not connected
    return this.#state === NetworkState.Connected ? this.#statusEmitter : null;
  }

  /**
   * Get the {@link Control} service. This service can be used to control the
   * Playstate of CDJs on the network.
   */
  get control() {
    return this.#connection?.control ?? null;
  }

  /**
   * Get the {@link Database} service. This service is used to retrieve
   * metadata and listings from devices on the network, automatically choosing the
   * best strategy to access the data.
   */
  get db() {
    return this.#connection?.database ?? null;
  }

  /**
   * Get the {@link LocalDatabase} service. This service is used to query and sync
   * metadata that is downloaded directly from the rekordbox database present
   * on media connected to the CDJs.
   */
  get localdb() {
    return this.#connection?.localdb ?? null;
  }

  /**
   * Get the {@link RemoteDatabase} service. This service is used to query
   * metadata directly from the database service running on Rekordbox and the CDJs
   * themselves.
   *
   * NOTE: To use this service to access the CDJ remote database service, the
   *       Virtual CDJ must report itself as an ID between 1 and 6. This means
   *       there cannot be four physical CDJs on the network to access any CDJs
   *       remote database.
   */
  get remotedb() {
    return this.#connection?.remotedb ?? null;
  }

  /**
   * Get (and initialize) the {@link MixstatusProcessor} service. This service can
   * be used to monitor the 'status' of devices on the network as a whole.
   */
  get mixstatus() {
    if (this.#connection === null) {
      return null;
    }

    // Delay initialization of the mixstatus processor so that we don't consume
    // status events unless we actually want to.
    if (this.#mixstatus === null) {
      this.#mixstatus = new MixstatusProcessor();
      this.#statusEmitter.on('status', s => this.#mixstatus?.handleState(s));
    }

    return this.#mixstatus;
  }
}
