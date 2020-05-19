import signale from 'signale';

import MixstatusProcessor from 'src/mixstaus';
import {bringOnline} from 'src/network';

async function cli() {
  signale.await('Bringing up prolink network');
  const network = await bringOnline();
  signale.success('Network online, preparing to connect');

  signale.await('Autoconfiguring network.. waiting for devices');
  await network.autoconfigFromPeers();
  signale.await('Autoconfigure successfull!');

  signale.await('Connecting to network!');
  network.connect();

  if (!network.isConnected()) {
    signale.error('Failed to connect to the network');
    return;
  }

  signale.star('Network connected! Network services initalized');

  const onlineDevices = [...network.deviceManager.devices.values()];
  const deviceList = onlineDevices.map(d => `${d.name} [${d.id}]`).join(', ');
  signale.note(`Found devices: ${deviceList}`);

  const processor = new MixstatusProcessor();
  network.statusEmitter.on('status', s => processor.handleState(s));

  processor.on('nowPlaying', async state => {
    const {trackDeviceId, trackSlot, trackType, trackId} = state;

    const track = await network.db.getMetadata({
      deviceId: trackDeviceId,
      trackSlot,
      trackType,
      trackId,
    });

    if (track === null) {
      signale.warn('no track');
      return;
    }

    const art = await network.db.getArtwork({
      deviceId: trackDeviceId,
      trackSlot,
      trackType,
      track,
    });

    console.log(trackId, track.title, art?.length);
  });
}

cli();
