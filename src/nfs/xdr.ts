import * as XDR from 'js-xdr';

/**
 * A xdr type to read the rest of the data in the buffer
 */
const OpaqueData = {
  read(io: any) {
    return io.slice().buffer();
  },

  write(value: any, io: any) {
    io.writeBufferPadded(value);
  },

  isValid(value: any) {
    return Buffer.isBuffer(value);
  },
};

export const rpc = XDR.config((xdr: any) => {
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

export const portmap = XDR.config((xdr: any) => {
  xdr.const('Program', 100000);

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

export const mount = XDR.config((xdr: any) => {
  xdr.const('Program', 100005);
});
