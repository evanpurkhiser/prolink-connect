/**
 * PSSI (song structure) parser tests.
 *
 * The section objects mirror what the Kaitai-generated parser produces for
 * `song_structure_tag` / `song_structure_body` / `song_structure_entry`
 * (see src/localdb/kaitai/rekordbox_anlz.ksy): the body holds `mood`,
 * `endBeat`, `bank` and `entries`, each entry holds `phraseNumber`,
 * `beatNumber`, a `kind` object with an `id`, `fillIn` and `fillInBeatNumber`.
 */

import {makeSongStructure} from 'src/localdb/rekordbox/anlz-parsers';

const entry = (
  phraseNumber: number,
  beatNumber: number,
  kindId: number,
  fillIn = 0,
  fillInBeatNumber = 0
) => ({phraseNumber, beatNumber, kind: {id: kindId}, fillIn, fillInBeatNumber});

const section = (mood: number, bank: number, endBeat: number, entries: unknown[]) => ({
  fourcc: 0x50535349,
  body: {mood, endBeat, bank, entries},
});

describe('makeSongStructure', () => {
  it('reads mood, bank and end beat from the body', () => {
    const result = makeSongStructure(section(2, 7, 512, []));

    expect(result.mood).toBe('mid');
    expect(result.bank).toBe('club_1');
    expect(result.endBeat).toBe(512);
    expect(result.phrases).toEqual([]);
  });

  it('reads phrase index, beat and kind from the generated field names', () => {
    const result = makeSongStructure(
      section(1, 0, 256, [entry(1, 1, 1), entry(2, 65, 2), entry(3, 129, 5)])
    );

    expect(result.phrases).toEqual([
      {index: 1, beat: 1, kind: 1, phraseType: 'Intro'},
      {index: 2, beat: 65, kind: 2, phraseType: 'Up'},
      {index: 3, beat: 129, kind: 5, phraseType: 'Chorus'},
    ]);
  });

  it('labels kinds by mood', () => {
    const mid = makeSongStructure(section(2, 0, 0, [entry(1, 1, 9)]));
    const low = makeSongStructure(section(3, 0, 0, [entry(1, 1, 4)]));

    expect(mid.phrases[0].phraseType).toBe('Chorus');
    expect(low.phrases[0].phraseType).toBe('Verse 1');
  });

  it('includes fill-in details only when present', () => {
    const result = makeSongStructure(
      section(2, 0, 0, [entry(1, 1, 1), entry(2, 33, 9, 1, 60)])
    );

    expect(result.phrases[0].fill).toBeUndefined();
    expect(result.phrases[0].fillBeat).toBeUndefined();
    expect(result.phrases[1].fill).toBe(1);
    expect(result.phrases[1].fillBeat).toBe(60);
  });

  it('falls back for unknown moods, banks and kinds', () => {
    const result = makeSongStructure(section(9, 42, 0, [entry(1, 1, 99)]));

    expect(result.mood).toBe('high');
    expect(result.bank).toBe('default');
    expect(result.phrases[0].phraseType).toBe('Unknown');
  });
});
