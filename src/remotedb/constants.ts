/**
 * All remote database messages include this 4 byte magic value.
 */
export const REMOTEDB_MAGIC = 0x872349ae;

/**
 * The consistent port on which we can query the remote db server for the port
 */
export const REMOTEDB_SERVER_QUERY_PORT = 12523;
