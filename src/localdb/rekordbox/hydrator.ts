import {KaitaiStream} from 'kaitai-struct';

import RekordboxPdb from 'src/localdb/kaitai/rekordbox_pdb.ksy';
import {MetadataORM} from 'src/localdb/orm';
import {TelemetrySpan as Span} from 'src/utils/telemetry';
import * as Telemetry from 'src/utils/telemetry';

import {pdbEntityCreators, pdbTables} from './table-mappings';
import type {HydrationOptions, HydrationProgress} from './types';

/**
 * This service provides utilities for translating rekordbox database (pdb_ and
 * analysis (ANLZ) files into the common entity types used in this library.
 */
export class RekordboxHydrator {
  #orm: MetadataORM;
  #onProgress: (progress: HydrationProgress) => void;

  constructor({orm, onProgress}: Omit<HydrationOptions, 'pdbData' | 'span'>) {
    this.#orm = orm;
    this.#onProgress = onProgress ?? (() => null);
  }

  /**
   * Extract entries from a rekordbox pdb file and hydrate the passed database
   * connection with entities derived from the rekordbox entries.
   */
  async hydrateFromPdb(pdbData: Buffer, span?: Span) {
    const tx = span
      ? span.startChild({op: 'hydrateFromPdb'})
      : Telemetry.startTransaction({name: 'hydrateFromPdb'});

    const parseTx = tx.startChild({op: 'parsePdbData', data: {size: pdbData.length}});
    const stream = new KaitaiStream(pdbData);
    const db = new RekordboxPdb(stream);
    parseTx.finish();

    const hydrateTx = tx.startChild({op: 'hydration'});
    await Promise.all(
      db.tables.map((table: any) => this.hydrateFromTable(table, hydrateTx))
    );
    hydrateTx.finish();

    tx.finish();
  }

  /**
   * Hydrate the database with entities from the provided RekordboxPdb table.
   * See pdbEntityCreators for how tables are mapped into database entities.
   */
  async hydrateFromTable(table: any, span: Span) {
    const tableName = pdbTables[table.type];
    const createObject = pdbEntityCreators[table.type];

    const tx = span.startChild({op: 'hydrateFromTable', description: tableName});

    if (createObject === undefined) {
      return;
    }

    let totalSaved = 0;
    let totalItems = 0;

    for (const _row of tableRows(table)) {
      void _row; // Intentionally unused - just counting
      totalItems++;
    }

    tx.setData('items', totalItems);

    // Use transaction for bulk inserts (10-100x faster)
    this.#orm.beginTransaction();

    try {
      for (const row of tableRows(table)) {
        const entity = createObject(row);
        this.#orm.insertEntity(tableName, entity);
        totalSaved++;

        // Report progress and yield every 100 rows (instead of every row)
        if (totalSaved % 100 === 0 || totalSaved === totalItems) {
          this.#onProgress({complete: totalSaved, table: tableName, total: totalItems});
          // Yield to event loop periodically to keep UI responsive
          await new Promise(r => setTimeout(r, 0));
        }
      }
    } finally {
      this.#orm.commit();
    }

    tx.finish();
  }
}

/**
 * Utility generator that pages through a table and yields every present row.
 * This flattens the concept of rowGroups and refs.
 */
function* tableRows(table: any) {
  const {firstPage, lastPage} = table;

  let pageRef = firstPage;
  do {
    const page = pageRef.body;

    // Adjust our page ref for the next iteration. We do this early in our loop
    // so we can break without having to remember to update for the next iter.
    pageRef = page.nextPage;

    // Ignore non-data pages. Not sure what these are for?
    if (!page.isDataPage) {
      continue;
    }

    const rows = page.rowGroups
      .map((group: any) => group.rows)
      .flat()
      .filter((row: any) => row.present);

    for (const row of rows) {
      yield row.body;
    }
  } while (pageRef.index <= lastPage.index);
}
