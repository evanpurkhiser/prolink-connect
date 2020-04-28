import dgram from 'dgram-as-promised';
import {createConnection} from 'typeorm';

import * as entities from 'src/entities';
import {hydrateDatabase, hydrateAnlz} from 'src/localdb/rekordbox';
import {fetchFile} from 'src/nfs';
import {TrackSlot, TrackType, Device, DeviceType} from 'src/types';
import {ANNOUNCE_PORT, STATUS_PORT} from 'src/constants';
import {getMatchingInterface, getBroadcastAddress} from 'src/utils';
import {getVirtualCDJ, makeAnnouncePacket} from 'src/virtualcdj';
import StatusEmitter from 'src/status';
import DeviceManager from 'src/devices';
import {RemoteDatabase, MenuTarget, Query} from 'src/remotedb';

async function test() {
  const dbConn = await createConnection({
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
  });

  // Socket used to listen for devices on the network
  const announceSocket = dgram.createSocket('udp4');
  await announceSocket.bind(ANNOUNCE_PORT, '0.0.0.0');
  announceSocket.setBroadcast(true);

  // Socket used to listen for status packets
  const statusSocket = dgram.createSocket('udp4');
  await statusSocket.bind(STATUS_PORT, '0.0.0.0');

  // Setup device services
  const deviceManager = new DeviceManager(announceSocket);
  const statusEmitter = new StatusEmitter(statusSocket);

  const device = await new Promise<Device>(resolve =>
    deviceManager.on('connected', d => d.type === DeviceType.Rekordbox && resolve(d))
  );

  const iface = getMatchingInterface(device.ip);

  if (iface === null) {
    throw new Error('Unable to determine network interface');
  }

  const broadcastAddr = getBroadcastAddress(iface);

  const vcdj = getVirtualCDJ(iface, 0x05);

  // Start announcing self as a Virtual CDJ so we may lookup track metadata
  const announcePacket = makeAnnouncePacket(vcdj);
  setInterval(
    () => announceSocket.send(announcePacket, ANNOUNCE_PORT, broadcastAddr),
    1500
  );

  const remotedb = new RemoteDatabase(vcdj);

  // Setup functions to lookup metadata for CDJ targets / RB targets

  let dbHyrdated = false;
  async function lookupOnCDJ(device: Device, trackSlot: TrackSlot, trackId: number) {
    if (
      trackSlot === TrackSlot.Empty ||
      trackSlot === TrackSlot.CD ||
      trackSlot === TrackSlot.RB
    ) {
      return;
    }

    if (dbHyrdated === false) {
      console.log('Downloading PDB database...');
      const pdbData = await fetchFile({
        device,
        slot: trackSlot,
        path: '.PIONEER/rekordbox/export.pdb',
        onProgress: console.log,
      });

      console.log('Hydrating database');
      await hydrateDatabase({conn: dbConn, pdbData});

      dbHyrdated = true;
    }

    const track = await dbConn
      .getRepository(entities.Track)
      .findOne({where: {id: trackId}});

    if (!track) {
      console.log('No track like that');
      return;
    }

    await hydrateAnlz(track, 'DAT', async path =>
      fetchFile({device, slot: trackSlot, path})
    );

    console.log('new track loaded...', track);
  }

  let didConnect = false;
  async function lookupOnRekordbox(device: Device, trackId: number) {
    if (!didConnect) {
      await remotedb.connectToDevice(device);
      didConnect = true;
    }
    console.log('connected');

    const queryDescriptor = {
      hostDevice: vcdj,
      targetDevice: device,
      trackSlot: TrackSlot.RB,
      trackType: TrackType.RB,
      menuTarget: MenuTarget.Main,
    };

    console.log('querying for track...');
    const track = await remotedb.query({
      queryDescriptor,
      query: Query.GetMetadata,
      args: {trackId},
    });

    console.log(track);
  }

  let currentTrack = 0;

  statusEmitter.on('status', async status => {
    if (status.trackId === currentTrack) {
      return;
    }

    // We're going to lookup a device, where is it
    const device = deviceManager.devices[status.trackDeviceId];

    if (device === undefined) {
      return;
    }

    if (device.type === DeviceType.Mixer) {
      return;
    }

    const {trackSlot, trackId} = status;
    currentTrack = trackId;

    // Lookup track from CDJ
    if (device.type === DeviceType.CDJ) {
      lookupOnCDJ(device, trackSlot, trackId);
      return;
    }

    if (device.type === DeviceType.Rekordbox) {
      lookupOnRekordbox(device, trackId);
      return;
    }
  });
}

test();
