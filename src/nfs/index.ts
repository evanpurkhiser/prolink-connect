import {RpcConnection} from './rpc';
import {nfs, mount} from './xdr';
import {
  makeProgramClient,
  getExports,
  mountFilesystem,
  lookupPath,
  fetchFile,
} from './programs';

export async function testRpc(filename: string, onProgress?: any) {
  const conn = new RpcConnection('192.168.86.90');

  const mountClient = await makeProgramClient(conn, {
    id: mount.Program,
    version: mount.Version,
  });

  const nfsClient = await makeProgramClient(conn, {
    id: nfs.Program,
    version: nfs.Version,
  });

  const exports = await getExports(mountClient);
  const rootHandle = await mountFilesystem(mountClient, exports[0]);
  const fileInfo = await lookupPath(nfsClient, rootHandle, filename);

  return await fetchFile(nfsClient, fileInfo, onProgress);
}
