import {Device, TrackSlot} from 'src/types';

import {RpcConnection, RpcProgram} from './rpc';
import {nfs, mount} from './xdr';
import {
  makeProgramClient,
  getExports,
  mountFilesystem,
  lookupPath,
  fetchFile as fetchFileCall,
} from './programs';

type ClientSet = {
  conn: RpcConnection;
  mountClient: RpcProgram;
  nfsClient: RpcProgram;
};

/**
 * The slot <-> mount name mapping is well known.
 */
const slotMountMapping = {
  [TrackSlot.USB]: '/C/',
  [TrackSlot.SD]: '/B/',
  [TrackSlot.RB]: '/',
} as const;

/**
 * This module maintains a singleton cached list of active connections given a
 * player address. It is not guarenteed that the connections
 */
const clientsCache: Map<string, ClientSet> = new Map();

/**
 * Given a device address running a nfs and mountd RPC server, provide
 * RpcProgram clients that may be used to call these services.
 */
async function getClients(address: string) {
  const cachedSet = clientsCache.get(address);

  if (cachedSet !== undefined && cachedSet.conn.connected) {
    return cachedSet;
  }

  // Cached socket is no longer connected. Remove and reconnect
  if (cachedSet !== undefined) {
    clientsCache.delete(address);
  }

  const conn = new RpcConnection(address);

  const mountClient = await makeProgramClient(conn, {
    id: mount.Program,
    version: mount.Version,
  });

  const nfsClient = await makeProgramClient(conn, {
    id: nfs.Program,
    version: nfs.Version,
  });

  const set = {conn, mountClient, nfsClient};
  clientsCache.set(address, set);

  return set;
}

type FetchFileOptions = {
  device: Device;
  slot: keyof typeof slotMountMapping;
  path: string;
};

export async function fetchFile({device, slot, path}: FetchFileOptions) {
  const {mountClient, nfsClient} = await getClients(device.ip.address);

  const exports = await getExports(mountClient);
  const targetExport = exports.find(e => e.filesystem == slotMountMapping[slot]);

  if (targetExport === undefined) {
    throw new Error(`The slot (${slot}) is not exported on Device ${device.id}`);
  }

  const rootHandle = await mountFilesystem(mountClient, targetExport);
  const fileInfo = await lookupPath(nfsClient, rootHandle, path);
  const file = await fetchFileCall(nfsClient, fileInfo);

  return file;
}
