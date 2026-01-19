import * as XDR from 'js-xdr';

/**
 * Calculate padding needed to align to 4-byte boundary (XDR requirement)
 */
function calculatePadding(length: number): number {
  const remainder = length % 4;
  return remainder === 0 ? 0 : 4 - remainder;
}

/**
 * Skip padding bytes in the IO stream
 */
function skipPadding(io: any, padding: number): void {
  if (padding > 0) {
    io._index += padding;
  }
}

/**
 * Read bytes from IO without automatic padding handling
 */
function readBytes(io: any, length: number): Buffer {
  const from = io._index;
  io._index += length;
  if (io._length < io._index) {
    throw new Error('attempt to read outside the boundary of the buffer');
  }
  return io._buffer.subarray(from, from + length);
}

/**
 * A xdr type to read the rest of the data in the buffer
 */
const OpaqueData = {
  read(io: any) {
    // Read all remaining bytes from the buffer
    const remaining = io._length - io._index;
    if (remaining <= 0) {
      return Buffer.alloc(0);
    }
    // Manually read without padding handling (we want all remaining bytes)
    const from = io._index;
    io._index = io._length;
    return io._buffer.subarray(from, io._length);
  },

  write(value: any, io: any) {
    io.write(value, value.length);
  },

  isValid(value: any) {
    return Buffer.isBuffer(value);
  },
};

/**
 * In the standard NFS protocol,strings are typically ASCII. For Pioneer
 * players, it is an UTF-16LE encoded string; This type handles conversion.
 */
class StringUTF16LE {
  read(io: any) {
    const length = XDR.Int.read(io);
    const padding = calculatePadding(length);
    const result = readBytes(io, length);

    skipPadding(io, padding);

    return result.toString('utf16le');
  }

  write(value: any, io: any) {
    const data = Buffer.from(value, 'utf16le');
    XDR.Int.write(data.length, io);
    io.write(data, data.length);
  }

  isValid(value: any) {
    return typeof value === 'string';
  }
}

/**
 * RPC XDR data types. This implements nearly the entire XDR spec for the
 * ONC-RPC protocol.
 */
export const rpc = XDR.config((xdr: any) => {
  xdr.const('Version', 2);

  xdr.enum('MessageType', {
    request: 0,
    response: 1,
  });

  xdr.enum('ResponseStatus', {
    accepted: 0,
    denied: 1,
  });

  xdr.enum('AcceptStatus', {
    success: 0,
    programUnavailable: 1,
    programMismatch: 2,
    processUnavailable: 3,
    garbageArguments: 4,
    systemError: 5,
  });

  xdr.enum('RejectStatus', {
    mismatch: 0,
    authError: 1,
  });

  xdr.enum('AuthStatus', {
    ok: 0,
    badCredentials: 1,
    rjectedCredentials: 2,
    badVerification: 3,
    rejectedVerification: 4,
    tooWeak: 5,
    invalidResponse: 6,
    failed: 7,
  });

  xdr.struct('UnixAuth', [
    ['stamp', xdr.uint()],
    ['name', xdr.string(255)],
    ['uid', xdr.uint()],
    ['gid', xdr.uint()],
    ['gids', xdr.varArray(xdr.uint(), 16)],
  ]);

  xdr.struct('Auth', [
    ['flavor', xdr.uint()],
    ['body', xdr.varOpaque(400)],
  ]);

  xdr.struct('Request', [
    ['rpcVersion', xdr.uint()],
    ['program', xdr.uint()],
    ['programVersion', xdr.uint()],
    ['procedure', xdr.uint()],
    ['auth', xdr.lookup('Auth')],
    ['verifier', xdr.lookup('Auth')],
    ['data', OpaqueData],
  ]);

  xdr.struct('MismatchInfo', [
    ['low', xdr.uint()],
    ['high', xdr.uint()],
  ]);

  xdr.union('ResponseData', {
    switchOn: xdr.lookup('AcceptStatus'),
    defaultArm: xdr.void(),
    switches: [
      ['success', 'success'],
      ['programMismatch', 'programMismatch'],
    ],
    arms: {
      success: OpaqueData,
      programMismatch: xdr.lookup('MismatchInfo'),
    },
  });

  xdr.struct('AcceptedResponse', [
    ['verifier', xdr.lookup('Auth')],
    ['response', xdr.lookup('ResponseData')],
  ]);

  xdr.union('RejectedResponse', {
    switchOn: xdr.lookup('RejectStatus'),
    switches: [
      ['mismatch', 'mismatch'],
      ['authError', 'authError'],
    ],
    arms: {
      mismatch: xdr.lookup('MismatchInfo'),
      authError: xdr.lookup('AuthStatus'),
    },
  });

  xdr.union('Response', {
    switchOn: xdr.lookup('ResponseStatus'),
    switches: [
      ['accepted', 'accepted'],
      ['denied', 'denied'],
    ],
    arms: {
      accepted: xdr.lookup('AcceptedResponse'),
      denied: xdr.void(),
    },
  });

  xdr.union('Message', {
    switchOn: xdr.lookup('MessageType'),
    switches: [
      ['request', 'request'],
      ['response', 'response'],
    ],
    arms: {
      request: xdr.lookup('Request'),
      response: xdr.lookup('Response'),
    },
  });

  xdr.struct('Packet', [
    ['xid', xdr.uint()],
    ['message', xdr.lookup('Message')],
  ]);
});

/**
 * Portmap RPC XDR types
 */
export const portmap = XDR.config((xdr: any) => {
  xdr.const('Program', 100000);
  xdr.const('Version', 2);

  xdr.enum('Procedure', {
    getPort: 3,
  });

  xdr.struct('GetPort', [
    ['program', xdr.uint()],
    ['version', xdr.uint()],
    ['protocol', xdr.uint()],
    ['port', xdr.uint()],
  ]);
});

/**
 * Mount RPC XDR types
 */
export const mount = XDR.config((xdr: any) => {
  xdr.const('Program', 100005);
  xdr.const('Version', 1);

  xdr.enum('Procedure', {
    mount: 1,
    export: 5,
  });

  xdr.typedef('Path', new StringUTF16LE());
  xdr.typedef('Filehandle', xdr.opaque(32));

  xdr.struct('MountRequest', [['filesystem', xdr.lookup('Path')]]);

  xdr.struct('Groups', [
    ['name', xdr.string(255)],
    ['next', xdr.option(xdr.lookup('Groups'))],
  ]);

  xdr.struct('ExportList', [
    ['filesystem', xdr.lookup('Path')],
    ['groups', xdr.option(xdr.lookup('Groups'))],
    ['next', xdr.option(xdr.lookup('ExportList'))],
  ]);

  xdr.union('FHStatus', {
    switchOn: xdr.uint(),
    defaultArm: xdr.void(),
    switches: [[0, 'success']],
    arms: {
      success: xdr.lookup('Filehandle'),
    },
  });

  xdr.struct('ExportListResponse', [['next', xdr.option(xdr.lookup('ExportList'))]]);
});

/**
 * NFS RPC XDR types
 */
export const nfs = XDR.config((xdr: any) => {
  xdr.const('Program', 100003);
  xdr.const('Version', 2);

  xdr.enum('Procedure', {
    lookup: 4,
    read: 6,
  });

  xdr.typedef('Filename', new StringUTF16LE());
  xdr.typedef('Filehandle', xdr.opaque(32));
  xdr.typedef('NFSData', xdr.varOpaque(8192));

  xdr.enum('FileType', {
    null: 0,
    regular: 1,
    directory: 2,
    block: 3,
    char: 4,
    link: 5,
  });

  xdr.struct('TimeValue', [
    ['seconds', xdr.uint()],
    ['useconds', xdr.uint()],
  ]);

  xdr.struct('FileAttributes', [
    ['type', xdr.lookup('FileType')],
    ['mode', xdr.uint()],
    ['nlink', xdr.uint()],
    ['uid', xdr.uint()],
    ['gid', xdr.uint()],
    ['size', xdr.uint()],
    ['blocksize', xdr.uint()],
    ['rdev', xdr.uint()],
    ['blocks', xdr.uint()],
    ['fsid', xdr.uint()],
    ['fileid', xdr.uint()],
    ['atime', xdr.lookup('TimeValue')],
    ['mtime', xdr.lookup('TimeValue')],
    ['ctime', xdr.lookup('TimeValue')],
  ]);

  xdr.struct('DirectoryOpArgs', [
    ['handle', xdr.lookup('Filehandle')],
    ['filename', xdr.lookup('Filename')],
  ]);

  xdr.struct('DirectoryOpResponseBody', [
    ['handle', xdr.lookup('Filehandle')],
    ['attributes', xdr.lookup('FileAttributes')],
  ]);

  xdr.union('DirectoryOpResponse', {
    switchOn: xdr.uint(),
    defaultArm: xdr.void(),
    switches: [[0, 'success']],
    arms: {
      success: xdr.lookup('DirectoryOpResponseBody'),
    },
  });

  xdr.struct('ReadArgs', [
    ['handle', xdr.lookup('Filehandle')],
    ['offset', xdr.uint()],
    ['count', xdr.uint()],
    ['totalCount', xdr.uint()],
  ]);

  xdr.struct('ReadBody', [
    ['attributes', xdr.lookup('FileAttributes')],
    ['data', xdr.lookup('NFSData')],
  ]);

  xdr.union('ReadResponse', {
    switchOn: xdr.uint(),
    defaultArm: xdr.void(),
    switches: [[0, 'success']],
    arms: {
      success: xdr.lookup('ReadBody'),
    },
  });
});
