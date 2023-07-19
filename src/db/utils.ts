import {fetchFile} from 'src/nfs';
import {Device, MediaSlot} from 'src/types';

interface AnlzLoaderOpts {
  device: Device;
  slot: MediaSlot.RB | MediaSlot.USB | MediaSlot.SD;
}

export function anlzLoader(opts: AnlzLoaderOpts) {
  return (path: string) => fetchFile({...opts, path});
}
