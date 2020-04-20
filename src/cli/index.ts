import 'module-alias/register';
import 'reflect-metadata';

import process from 'process';

import fs from 'fs';
import {createConnection} from 'typeorm';
import * as Sentry from '@sentry/browser';
import ora from 'ora';

import {setupConnections} from 'src/devices';
import * as entities from 'src/entities';
import {hydrateDatabase} from 'src/localdb/rekordbox';

Sentry.init({
  dsn: 'https://36570041fd5a4c05af76456e60a1233a@o126623.ingest.sentry.io/5205486',
});

async function testPdb() {
  const conn = await createConnection({
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
  });

  const data = fs.readFileSync(
    '/Volumes/My Passport for Mac/.PIONEER/rekordbox/export.pdb'
  );

  const loader = ora('Loading database').start();

  await hydrateDatabase({
    conn,
    pdbData: data,
    anlzFileResolver: async path =>
      fs.readFileSync(`/Volumes/My Passport for Mac/${path}`),
    onProgress: data => {
      loader.text = `[${data.table}] ${data.action} ${data.complete}/${data.total}`;
      loader.render();
    },
  });

  loader.succeed('Database loaded');

  console.log('DONE hydrating');

  const track = await conn.getRepository(entities.Track).findOne(1);

  console.log(track);

  process.exit();
}

testPdb();

setupConnections();
