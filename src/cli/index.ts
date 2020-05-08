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
import Database from 'src/db';
import MixstatusProcessor from 'src/mixstaus';

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

  // Start announcing self as a Virtual CDJ so we may lookup track metadata
  const announcePacket = makeAnnouncePacket(vcdj);
  setInterval(
    () => announceSocket.send(announcePacket, ANNOUNCE_PORT, broadcastAddr),
    1500
  );

  const remotedb = new RemoteDatabase(deviceManager, vcdj);
  const localdb = new LocalDatabase(vcdj, deviceManager, statusEmitter);

  localdb.on('fetchProgress', p => console.log(p.progress));
  localdb.on('hydrationProgress', p => console.log(p.progress));

  const db = new Database(vcdj, localdb, remotedb, deviceManager);

  const processor = new MixstatusProcessor();
  statusEmitter.on('status', s => processor.handleState(s));

  processor.on('nowPlaying', async state => {
    const {trackDeviceId, trackSlot, trackType, trackId} = state;

    const track = await db.getMetadata({
      deviceId: trackDeviceId,
      trackSlot,
      trackType,
      trackId,
    });

    if (track === null) {
      signale.warn('no track');
      return;
    }

    const art = await db.getArtwork({
      deviceId: trackDeviceId,
      trackSlot,
      trackType,
      track,
    });

    console.log(trackId, track.title, art?.length);
  });
}

test();
