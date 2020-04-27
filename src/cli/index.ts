import process from 'process';
import {createConnection} from 'typeorm';
import * as Sentry from '@sentry/browser';
import {Integrations as ApmIntegrations} from '@sentry/apm';

import {setupConnections} from 'src/devices';
import * as entities from 'src/entities';
import {hydrateDatabase, expectedTables, hydrateAnlz} from 'src/localdb/rekordbox';
import {fetchFile} from 'src/nfs';
import {TrackSlot} from 'src/types';

Sentry.init({
  dsn: 'https://36570041fd5a4c05af76456e60a1233a@o126623.ingest.sentry.io/5205486',
  integrations: [new ApmIntegrations.Tracing()],
  tracesSampleRate: 1.0,
});

async function testPdb() {
  const device = await setupConnections();

  process.exit();

  const conn = await createConnection({
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
  });

  console.log('Downloading PDB');

  const pdbData = await fetchFile({
    device: device,
    slot: TrackSlot.USB,
    path: '.PIONEER/rekordbox/export.pdb',
    onProgress: console.log,
  });

  console.log('Got pdbData');

  await hydrateDatabase({conn, pdbData});

  const playlist = await conn
    .getRepository(entities.Playlist)
    .find({where: {parent: 9}, relations: ['entries', 'entries.track']});

  const track = playlist[0].entries[0].track;

  await hydrateAnlz(
    track,
    'DAT',
    async path => await fetchFile({device, slot: TrackSlot.USB, path})
  );

  console.log(track);

  process.exit();

  // TODO:
  //
  // Interface for Device Dependant service,
}

testPdb();
