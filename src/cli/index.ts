import signale from 'signale';

import MixstatusProcessor from 'src/mixstaus';
import ProlinkNetwork from 'src/network';

async function test() {
  signale.await('Connecting to network');
  const network = await ProlinkNetwork.connect();
  signale.success('Connected to network!');

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

test();
