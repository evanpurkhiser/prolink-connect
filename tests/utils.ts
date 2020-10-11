import {readFile} from 'fs/promises';

export function readMock(path: string) {
  return readFile(`${__dirname}/_data/${path}`);
}
