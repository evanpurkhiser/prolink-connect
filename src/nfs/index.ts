import RpcClient from 'src/nfs/rpc';
import {portmap, mount, nfs} from 'src/nfs/xdr';

/**
 * Helper to flatten linked list structures into an array
 */
const flattenLinkedList = (item: any): any => [
  item,
  ...(item.next() ? flattenLinkedList(item.next()) : []),
];

/**
 * How many bytes of the file should we read at once?
 */
const READ_SIZE = 2048;

type Program = {
  id: number;
  version: number;
};

async function getProgramPort(client: RpcClient, program: Program) {
  const getPortData = new portmap.GetPort({
    program: program.id,
    version: program.version,
    protocol: 17, // UDP protocl
    port: 0,
  });

  const data = await client.call({
    port: 111,
    program: portmap.Program,
    version: portmap.Version,
    procedure: portmap.Procedure.getPort().value,
    data: getPortData.toXDR(),
  });

  return data.readInt32BE();
}

type Export = {
  /**
   * The name of the exported filesystem
   */
  filesystem: string;
  /**
   * The groups allowed to mount this filesystem
   */
  groups: string[];
};

/**
 * Request a list of export entries.
 */
async function getExports(client: RpcClient, port: number) {
  const data = await client.call({
    port,
    program: mount.Program,
    version: mount.Version,
    procedure: mount.Procedure.export().value,
    data: Buffer.alloc(0),
  });

  let entry = mount.ExportListResponse.fromXDR(data).next();
  if (entry === undefined) {
    return [];
  }

  const exports = flattenLinkedList(entry).map((entry: any) => ({
    filesystem: entry.filesystem(),
    groups: flattenLinkedList(entry.groups()).map((g: any) => g.name().toString()),
  }));

  return exports as Export[];
}

/**
 * Mount the specified export, returning the file handle.
 */
async function mountFilesystem(client: RpcClient, port: number, {filesystem}: Export) {
  const resp = await client.call({
    port,
    program: mount.Program,
    version: mount.Version,
    procedure: mount.Procedure.mount().value,
    data: new mount.MountRequest({filesystem}).toXDR(),
  });

  const fileHandleResp = mount.FHStatus.fromXDR(resp);
  if (fileHandleResp.arm() !== 'success') {
    throw new Error('Failed to mount filesystem');
  }

  return fileHandleResp.success() as Buffer;
}

type FileInfo = {
  handle: Buffer;
  name: string;
  size: number;
  type: 'null' | 'regular' | 'directory' | 'block' | 'char' | 'link';
};

/**
 * Lookup a file within the directory of the provided file handle, returning
 * the FileInfo object if the file can be located.
 */
async function lookupFile(
  client: RpcClient,
  port: number,
  handle: Buffer,
  filename: string
) {
  const resp = await client.call({
    port,
    program: nfs.Program,
    version: nfs.Version,
    procedure: nfs.Procedure.lookup().value,
    data: new nfs.DirectoryOpArgs({handle, filename}).toXDR(),
  });

  const fileResp = nfs.DirectoryOpResponse.fromXDR(resp);
  if (fileResp.arm() !== 'success') {
    throw new Error('Failed to lookup file');
  }

  const fileHandle = fileResp.success().handle();
  const attributes = fileResp.success().attributes();

  const info: FileInfo = {
    name: filename,
    handle: fileHandle,
    size: attributes.size(),
    type: attributes.type().name,
  };

  return info;
}

/**
 * Lookup the absolute path to a file, given the root file handle and path,
 */
async function lookupPath(
  client: RpcClient,
  port: number,
  rootHandle: Buffer,
  filepath: string
) {
  const pathParts = filepath.split('/');

  let handle: Buffer = rootHandle;
  let info: FileInfo;

  while (pathParts.length !== 0) {
    const filename = pathParts.shift()!;
    const fileInfo = await lookupFile(client, port, handle, filename);

    info = fileInfo;
    handle = info.handle;
  }

  // We can gaurentee this will be set
  return info!;
}

type ProgressFunc = (progress: {read: number; total: number}) => void;

/**
 * Fetch the specified file the remote NFS server. This will read the entire
 * file into memory.
 */
async function fetchFile(
  client: RpcClient,
  port: number,
  file: FileInfo,
  onProgress?: ProgressFunc
) {
  const {handle, size} = file;
  const data = Buffer.alloc(size);

  let bytesRead = 0;

  while (bytesRead < size) {
    const readArgs = new nfs.ReadArgs({
      handle,
      offset: bytesRead,
      count: READ_SIZE,
      totalCount: 0,
    });

    const resp = await client.call({
      port,
      program: nfs.Program,
      version: nfs.Version,
      procedure: nfs.Procedure.read().value,
      data: readArgs.toXDR(),
    });

    const dataResp = nfs.ReadResponse.fromXDR(resp);
    if (dataResp.arm() !== 'success') {
      throw new Error(`Failed to read file at offset ${bytesRead} / ${size}`);
    }

    const buffer = dataResp.success().data();

    data.set(buffer, bytesRead);
    bytesRead += buffer.length;

    onProgress?.({read: bytesRead, total: size});
  }

  return data;
}

export async function testRpc(filename: string, onProgress?: ProgressFunc) {
  const client = new RpcClient('192.168.86.90');

  const mountPort = await getProgramPort(client, {
    id: mount.Program,
    version: mount.Version,
  });

  const nfsPort = await getProgramPort(client, {
    id: nfs.Program,
    version: nfs.Version,
  });

  const exports = await getExports(client, mountPort);

  console.log(exports);

  const rootHandle = await mountFilesystem(client, mountPort, exports[1]);

  const fileInfo = await lookupPath(client, nfsPort, rootHandle, filename);

  return await fetchFile(client, nfsPort, fileInfo, onProgress);
}
