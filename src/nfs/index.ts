import * as Sentry from '@sentry/node';
import {Span} from '@sentry/apm';

import {getSlotName} from 'src/utils';
import {Device, MediaSlot, DeviceID} from 'src/types';

import {RpcConnection, RpcProgram, RetryConfig} from './rpc';
import {nfs, mount} from './xdr';
import {
  makeProgramClient,
  getExports,
  mountFilesystem,
  lookupPath,
  fetchFile as fetchFileCall,
  FileInfo,
} from './programs';

export type FetchProgress = {
  read: number;
  total: number;
};

type ClientSet = {
  conn: RpcConnection;
  mountClient: RpcProgram;
  nfsClient: RpcProgram;
};

/**
 * The slot <-> mount name mapping is well known.
 */
const slotMountMapping = {
  [MediaSlot.USB]: '/C/',
  [MediaSlot.SD]: '/B/',
  [MediaSlot.RB]: '/',
} as const;

/**
 * The module-level retry configuration for newly created RpcConnections.
 */
let retryConfig: RetryConfig = {};

/**
 * This module maintains a singleton cached list of player addresses -> active
 * connections. It is not guaranteed that the connections in the cache will
 * still be connected.
 */
const clientsCache: Map<string, ClientSet> = new Map();

/**
 * Given a device address running a nfs and mountd RPC server, provide
 * RpcProgram clients that may be used to call these services.
 *
 * NOTE: This function will cache the clients for the address, recreating the
 * connections if the cached clients have disconnected.
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

  const conn = new RpcConnection(address, retryConfig);

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

type GetRootHandleOptions = {
  device: Device;
  slot: keyof typeof slotMountMapping;
  mountClient: RpcProgram;
  span?: Span;
};

/**
 * This module maintains a singleton cached list of (device address + slot) -> file
 * handles. The file handles may become stale in this list should the devices
 * connected to the players slot change.
 */
const rootHandleCache: Map<string, Map<MediaSlot, Buffer>> = new Map();

/**
 * Locate the root filehandle of the given device slot.
 *
 * NOTE: This function will cache the root handle for the device + slot. Should
 *       the device have changed the slot will not longer be valid (TODO,
 *       verify this). It is up to the caller to clear the cache and get the
 *       new root handle in that case.
 */
async function getRootHandle({device, slot, mountClient, span}: GetRootHandleOptions) {
  const tx = span?.startChild({op: 'getRootHandle'});

  const {address} = device.ip;

  const deviceSlotCache = rootHandleCache.get(address) ?? new Map<MediaSlot, Buffer>();
  const cachedRootHandle = deviceSlotCache.get(slot);

  if (cachedRootHandle !== undefined) {
    return cachedRootHandle;
  }

  const exports = await getExports(mountClient, tx);
  const targetExport = exports.find(e => e.filesystem === slotMountMapping[slot]);

  if (targetExport === undefined) {
    return null;
  }

  const rootHandle = await mountFilesystem(mountClient, targetExport, tx);

  deviceSlotCache.set(slot, rootHandle);
  rootHandleCache.set(address, deviceSlotCache);

  tx?.finish();

  return rootHandle;
}

type FetchFileOptions = {
  device: Device;
  slot: keyof typeof slotMountMapping;
  path: string;
  onProgress?: Parameters<typeof fetchFileCall>[2];
  span?: Span;
};

const badRoothandleError = (slot: MediaSlot, deviceId: DeviceID) =>
  new Error(`The slot (${slot}) is not exported on Device ${deviceId}`);

/**
 * Fetch a file from a devices NFS server.
 *
 * NOTE: The connection and root filehandle (The 'mounted' NFS export on the
 *       device) is cached to improve subsequent fetching performance. It's
 *       important that when the device disconnects you call the {@link
 *       resetDeviceCache} function.
 */
export async function fetchFile({
  device,
  slot,
  path,
  onProgress,
  span,
}: FetchFileOptions) {
  const tx = span
    ? span.startChild({op: 'fetchFile'})
    : Sentry.startTransaction({name: 'fetchFile'});

  const {mountClient, nfsClient} = await getClients(device.ip.address);
  const rootHandle = await getRootHandle({device, slot, mountClient, span: tx});

  if (rootHandle === null) {
    throw badRoothandleError(slot, device.id);
  }

  // It's possible that our roothandle is no longer valid, if we fail to lookup
  // a path lets first try and clear our roothandle cache
  let fileInfo: FileInfo | null = null;

  try {
    fileInfo = await lookupPath(nfsClient, rootHandle, path, tx);
  } catch {
    rootHandleCache.delete(device.ip.address);
    const rootHandle = await getRootHandle({device, slot, mountClient, span: tx});

    if (rootHandle === null) {
      throw badRoothandleError(slot, device.id);
    }

    // Desperately try once more to lookup the file
    fileInfo = await lookupPath(nfsClient, rootHandle, path, tx);
  }

  const file = await fetchFileCall(nfsClient, fileInfo, onProgress, tx);

  tx.setData('path', path);
  tx.setData('slot', getSlotName(slot));
  tx.setData('size', fileInfo.size);
  tx.finish();

  return file;
}

/**
 * Clear the cached NFS connection and root filehandle for the given device
 */
export function resetDeviceCache(device: Device) {
  clientsCache.delete(device.ip.address);
  rootHandleCache.delete(device.ip.address);
}

/**
 * Configure the retry strategy for making NFS calls using this module
 */
export function configureRetryStrategy(config: RetryConfig) {
  retryConfig = config;

  for (const client of clientsCache.values()) {
    client.conn.retryConfig = config;
  }
}
