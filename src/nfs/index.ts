import {Device, DeviceID, DeviceType, MediaSlot} from 'src/types';
import {getSlotName} from 'src/utils';
import {TelemetrySpan as Span} from 'src/utils/telemetry';
import * as Telemetry from 'src/utils/telemetry';

import {
  fetchFile as fetchFileCall,
  fetchFileRange as fetchFileRangeInternal,
  FileInfo,
  getExports,
  lookupPath,
  makeProgramClient,
  mountFilesystem,
  REKORDBOX_PORTMAP_PORT,
  STANDARD_PORTMAP_PORT,
} from './programs';

export type {FileInfo} from './programs';
import {RetryConfig, RpcConnection, RpcProgram} from './rpc';
import {mount, nfs} from './xdr';

export interface FetchProgress {
  read: number;
  total: number;
}

interface ClientSet {
  conn: RpcConnection;
  mountClient: RpcProgram;
  nfsClient: RpcProgram;
}

/**
 * The slot <-> mount name mapping is well known.
 */
const slotMountMapping = {
  [MediaSlot.USB]: '/C/',
  [MediaSlot.SD]: '/B/',
} as const;

/**
 * Media slots that support NFS access.
 */
export type NfsMediaSlot = MediaSlot.USB | MediaSlot.SD | MediaSlot.RB;

/**
 * Parse a Windows absolute path (e.g. `C:\Users\chris\Music\track.mp3`)
 * into the NFS mount path and relative file path.
 *
 * @internal Exported for testing
 */
export function parseWindowsPath(filePath: string): {mountPath: string; nfsPath: string} | null {
  const match = filePath.match(/^([A-Za-z]):[/\\](.*)$/);
  if (!match) return null;
  return {
    mountPath: `/${match[1].toUpperCase()}/`,
    nfsPath: match[2].replace(/\\/g, '/'),
  };
}

/**
 * Resolve the NFS mount path and file path for a given slot.
 *
 * For USB/SD slots, the mount path is well-known (/C/ and /B/).
 * For the RB slot, the mount path is extracted from the file path returned
 * by remotedb:
 * - Windows: `C:\Users\chris\Music\track.mp3` → mount `/C/`, path `Users/chris/Music/track.mp3`
 * - macOS: `/Users/chris/Music/track.mp3` → mount `/`, path `Users/chris/Music/track.mp3`
 *
 * @internal Exported for testing
 */
export function resolveNfsPath(
  slot: NfsMediaSlot,
  filePath: string
): {mountPath: string; nfsPath: string} {
  if (slot === MediaSlot.RB) {
    // Windows: C:\Users\chris\Music\track.mp3 → mount /C/, path Users/...
    const parsed = parseWindowsPath(filePath);
    if (parsed) return parsed;

    // macOS: /Users/chris/Music/track.mp3 → mount /, path Users/...
    if (filePath.startsWith('/')) {
      return {
        mountPath: '/',
        nfsPath: filePath.slice(1),
      };
    }
  }
  return {
    mountPath: slotMountMapping[slot as keyof typeof slotMountMapping],
    nfsPath: filePath,
  };
}

/**
 * The module-level retry configuration for newly created RpcConnections.
 */
let retryConfig: RetryConfig = {};

/**
 * This module maintains a singleton cached list of player addresses -> active
 * connections. It is not guaranteed that the connections in the cache will
 * still be connected.
 */
const clientsCache = new Map<string, ClientSet>();

/**
 * Get the portmapper port for the given device. Rekordbox software uses a
 * non-standard port (50111) while CDJs and other hardware use the standard
 * port (111).
 *
 * @internal Exported for testing
 */
export function getPortmapPort(device: Device): number {
  return device.type === DeviceType.Rekordbox
    ? REKORDBOX_PORTMAP_PORT
    : STANDARD_PORTMAP_PORT;
}

/**
 * Given a device address running a nfs and mountd RPC server, provide
 * RpcProgram clients that may be used to call these services.
 *
 * NOTE: This function will cache the clients for the address, recreating the
 * connections if the cached clients have disconnected.
 */
async function getClients(device: Device) {
  const {address} = device.ip;
  const cachedSet = clientsCache.get(address);

  if (cachedSet !== undefined && cachedSet.conn.connected) {
    return cachedSet;
  }

  // Cached socket is no longer connected. Remove and reconnect
  if (cachedSet !== undefined) {
    clientsCache.delete(address);
  }

  const conn = new RpcConnection(address, retryConfig);
  const portmapPort = getPortmapPort(device);

  const mountClient = await makeProgramClient(conn, {
    id: mount.Program,
    version: mount.Version,
  }, portmapPort);

  const nfsClient = await makeProgramClient(conn, {
    id: nfs.Program,
    version: nfs.Version,
  }, portmapPort);

  const set = {conn, mountClient, nfsClient};
  clientsCache.set(address, set);

  return set;
}

interface GetRootHandleOptions {
  device: Device;
  mountPath: string;
  mountClient: RpcProgram;
  span?: Span;
}

/**
 * This module maintains a singleton cached list of (device address + mount path) -> file
 * handles. The file handles may become stale in this list should the devices
 * connected to the players slot change.
 */
const rootHandleCache = new Map<string, Map<string, Buffer>>();

/**
 * Locate the root filehandle of the given device mount path.
 *
 * NOTE: This function will cache the root handle for the device + mount path. Should
 *       the device have changed the slot will not longer be valid (TODO,
 *       verify this). It is up to the caller to clear the cache and get the
 *       new root handle in that case.
 */
async function getRootHandle({device, mountPath, mountClient, span}: GetRootHandleOptions) {
  const tx = span?.startChild({op: 'getRootHandle'});

  const {address} = device.ip;

  const deviceMountCache = rootHandleCache.get(address) ?? new Map<string, Buffer>();
  const cachedRootHandle = deviceMountCache.get(mountPath);

  if (cachedRootHandle !== undefined) {
    return cachedRootHandle;
  }

  const exports = await getExports(mountClient, tx);
  const targetExport = exports.find(e => e.filesystem === mountPath);

  if (targetExport === undefined) {
    return null;
  }

  const rootHandle = await mountFilesystem(mountClient, targetExport, tx);

  deviceMountCache.set(mountPath, rootHandle);
  rootHandleCache.set(address, deviceMountCache);

  tx?.finish();

  return rootHandle;
}

interface FetchFileOptions {
  device: Device;
  slot: NfsMediaSlot;
  path: string;
  onProgress?: Parameters<typeof fetchFileCall>[2];
  span?: Span;
  chunkSize?: number;
}

const badRoothandleError = (slot: MediaSlot, deviceId: DeviceID) =>
  new Error(`The slot (${slot}) is not exported on Device ${deviceId}`);

interface FetchFileRangeOptions {
  device: Device;
  slot: NfsMediaSlot;
  path: string;
  offset: number;
  length: number;
  span?: Span;
}

/**
 * Fetch a range of bytes from a file on a device's NFS server.
 * Optimized for partial reads (e.g., reading file headers for metadata extraction).
 */
export async function fetchFileRange({
  device,
  slot,
  path,
  offset,
  length,
  span,
}: FetchFileRangeOptions): Promise<Buffer> {
  const tx = span
    ? span.startChild({op: 'fetchFileRange'})
    : Telemetry.startTransaction({name: 'fetchFileRange'});

  const {mountPath, nfsPath} = resolveNfsPath(slot, path);
  const {mountClient, nfsClient} = await getClients(device);
  const rootHandle = await getRootHandle({device, mountPath, mountClient, span: tx});

  if (rootHandle === null) {
    throw badRoothandleError(slot, device.id);
  }

  let fileInfo: FileInfo | null = null;

  try {
    fileInfo = await lookupPath(nfsClient, rootHandle, nfsPath, tx);
  } catch {
    rootHandleCache.delete(device.ip.address);
    const newRootHandle = await getRootHandle({device, mountPath, mountClient, span: tx});

    if (newRootHandle === null) {
      throw badRoothandleError(slot, device.id);
    }

    fileInfo = await lookupPath(nfsClient, newRootHandle, nfsPath, tx);
  }

  const actualOffset = Math.min(offset, fileInfo.size);
  const actualLength = Math.min(length, fileInfo.size - actualOffset);

  if (actualLength <= 0) {
    tx.finish();
    return Buffer.alloc(0);
  }

  const data = await fetchFileRangeInternal(
    nfsClient,
    fileInfo,
    actualOffset,
    actualLength,
    tx
  );

  tx.setData('path', path);
  tx.setData('slot', getSlotName(slot));
  tx.setData('offset', actualOffset);
  tx.setData('length', actualLength);
  tx.setData('fileSize', fileInfo.size);
  tx.finish();

  return data;
}

/**
 * Get file info (size, handle) without fetching the file content.
 */
export async function getFileInfo({
  device,
  slot,
  path,
  span,
}: Omit<FetchFileOptions, 'onProgress' | 'chunkSize'>): Promise<FileInfo> {
  const tx = span
    ? span.startChild({op: 'getFileInfo'})
    : Telemetry.startTransaction({name: 'getFileInfo'});

  const {mountPath, nfsPath} = resolveNfsPath(slot, path);
  const {mountClient, nfsClient} = await getClients(device);
  const rootHandle = await getRootHandle({device, mountPath, mountClient, span: tx});

  if (rootHandle === null) {
    throw badRoothandleError(slot, device.id);
  }

  let fileInfo: FileInfo;

  try {
    fileInfo = await lookupPath(nfsClient, rootHandle, nfsPath, tx);
  } catch {
    rootHandleCache.delete(device.ip.address);
    const newRootHandle = await getRootHandle({device, mountPath, mountClient, span: tx});

    if (newRootHandle === null) {
      throw badRoothandleError(slot, device.id);
    }

    fileInfo = await lookupPath(nfsClient, newRootHandle, nfsPath, tx);
  }

  tx.setData('path', path);
  tx.setData('slot', getSlotName(slot));
  tx.setData('size', fileInfo.size);
  tx.finish();

  return fileInfo;
}

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
  chunkSize,
}: FetchFileOptions) {
  const tx = span
    ? span.startChild({op: 'fetchFile'})
    : Telemetry.startTransaction({name: 'fetchFile'});

  const {mountPath, nfsPath} = resolveNfsPath(slot, path);
  const {mountClient, nfsClient} = await getClients(device);
  const rootHandle = await getRootHandle({device, mountPath, mountClient, span: tx});

  if (rootHandle === null) {
    throw badRoothandleError(slot, device.id);
  }

  // It's possible that our roothandle is no longer valid, if we fail to lookup
  // a path lets first try and clear our roothandle cache
  let fileInfo: FileInfo | null = null;

  try {
    fileInfo = await lookupPath(nfsClient, rootHandle, nfsPath, tx);
  } catch {
    rootHandleCache.delete(device.ip.address);
    const rootHandle = await getRootHandle({device, mountPath, mountClient, span: tx});

    if (rootHandle === null) {
      throw badRoothandleError(slot, device.id);
    }

    // Desperately try once more to lookup the file
    fileInfo = await lookupPath(nfsClient, rootHandle, nfsPath, tx);
  }

  const file = await fetchFileCall(nfsClient, fileInfo, onProgress, tx, chunkSize);

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
