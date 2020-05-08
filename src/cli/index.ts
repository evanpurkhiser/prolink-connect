import dgram from 'dgram-as-promised';
import signale from 'signale';

import * as entities from 'src/entities';
import {hydrateAnlz} from 'src/localdb/rekordbox';
import {fetchFile} from 'src/nfs';
import {MediaSlot, TrackType, Device, DeviceType, DeviceID} from 'src/types';
import {ANNOUNCE_PORT, STATUS_PORT} from 'src/constants';
import {getMatchingInterface, getBroadcastAddress} from 'src/utils';
import {getVirtualCDJ, makeAnnouncePacket} from 'src/virtualcdj';
import StatusEmitter from 'src/status';
import DeviceManager from 'src/devices';
import {RemoteDatabase, MenuTarget, Query} from 'src/remotedb';
import LocalDatabase from 'src/localdb/';

async function test() {
  signale.info('Opening announce connection...');
  // Socket used to listen for devices on the network
  const announceSocket = dgram.createSocket('udp4');
  await announceSocket.bind(ANNOUNCE_PORT, '0.0.0.0');
  announceSocket.setBroadcast(true);

  signale.info('Opening status connection...');
  // Socket used to listen for status packets
  const statusSocket = dgram.createSocket('udp4');
  await statusSocket.bind(STATUS_PORT, '0.0.0.0');

  signale.success('Sockets connected!');

  // Setup device services
  const deviceManager = new DeviceManager(announceSocket);
  const statusEmitter = new StatusEmitter(statusSocket);

  deviceManager.on('connected', d =>
    signale.star(`New device seen: ${d.name} [${d.id}] [${d.ip.address}]`)
  );

  const firstDevice = await new Promise<Device>(resolve =>
    deviceManager.once('connected', d => resolve(d))
  );
  signale.star(`Got first device: ${firstDevice.name} (${firstDevice.ip.address})`);

  const iface = getMatchingInterface(firstDevice.ip);
  signale.warn(`Selected interface: ${iface?.name}`);

  if (iface === null) {
    throw new Error('Unable to determine network interface');
  }

  const broadcastAddr = getBroadcastAddress(iface);
  signale.star(`Using broadcast address: ${broadcastAddr}`);

  const vcdj = getVirtualCDJ(iface, 0x05);

  // Setup database manager service to handle loading the database
  const localDb = new LocalDatabase(vcdj, deviceManager, statusEmitter);

  //localDb.preload();

  localDb.on('fetchProgress', p => console.log(p.progress));
  localDb.on('hydrationProgress', p => console.log(p.progress));

  // Start announcing self as a Virtual CDJ so we may lookup track metadata
  const announcePacket = makeAnnouncePacket(vcdj);
  setInterval(
    () => announceSocket.send(announcePacket, ANNOUNCE_PORT, broadcastAddr),
    1500
  );

  const remotedb = new RemoteDatabase(vcdj);

  // Setup functions to lookup metadata for CDJ targets / RB targets

  async function lookupOnCDJ(device: Device, trackSlot: MediaSlot, trackId: number) {
    if (
      trackSlot === MediaSlot.Empty ||
      trackSlot === MediaSlot.CD ||
      trackSlot === MediaSlot.RB
    ) {
      return;
    }

    console.log('doing hydration now....');
    const conn = await localDb.get(device.id, trackSlot);

    if (conn === null) {
      return;
    }

    signale.info(`Locating track id: ${trackId}`);
    const track = await conn
      .getRepository(entities.Track)
      .findOne({where: {id: trackId}});

    if (!track) {
      signale.error('No track found in database');
      return;
    }

    signale.success(`Found track!`);

    signale.info('Hydrating track ANLZ data just in time');
    await hydrateAnlz(track, 'DAT', async path =>
      fetchFile({device, slot: trackSlot, path})
    );

    track.beatGrid = track.beatGrid?.slice(0, 5)!;

    signale.star(track);
  }

  let didConnect = false;
  async function lookupOnRekordbox(device: Device, trackId: number) {
    if (!didConnect) {
      signale.info(`Connecting to remotedb of device ${device.id} (${device.name})...`);
      await remotedb.connectToDevice(device);
      didConnect = true;
      signale.success(`Connected!`);
    }

    const queryDescriptor = {
      hostDevice: vcdj,
      targetDevice: device,
      trackSlot: MediaSlot.RB,
      trackType: TrackType.RB,
      menuTarget: MenuTarget.Main,
    };

    signale.info(`Querying remotedb for track id: ${trackId}`);
    const track = await remotedb.query({
      queryDescriptor,
      query: Query.GetMetadata,
      args: {trackId},
    });

    signale.info(`Got track from remoteDB!`);

    signale.star(track);
  }

  let currentTrack: Record<DeviceID, number> = {};

  statusEmitter.on('status', async status => {
    if (status.trackId === currentTrack[status.deviceId]) {
      return;
    }

    // We're going to lookup a device, where is it
    const device = deviceManager.devices.get(status.trackDeviceId);

    if (device === undefined) {
      return;
    }

    if (device.type === DeviceType.Mixer) {
      return;
    }

    signale.star(`Track changed on device ${status.deviceId}!`);

    const {trackSlot, trackId} = status;
    currentTrack[status.deviceId] = trackId;

    // Lookup track from CDJ
    if (device.type === DeviceType.CDJ) {
      signale.fav('Track loaded on CDJ.. Using Rekordbox DB brainsuck strategy');
      lookupOnCDJ(device, trackSlot, trackId);
      return;
    }

    if (device.type === DeviceType.Rekordbox) {
      signale.fav('Track loaded on Rekordbox.. Using remotedb protocol');
      lookupOnRekordbox(device, trackId);
      return;
    }
  });
}

test();
