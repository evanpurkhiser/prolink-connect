import {Socket, BindOptions} from 'dgram';
import {AddressInfo} from 'net';

/**
 * Async version of upd socket bind
 */
export function udpBind(
  conn: Socket,
  port?: number,
  address?: string
): Promise<AddressInfo>;
export function udpBind(conn: Socket, options: BindOptions): Promise<AddressInfo>;
export function udpBind(conn: Socket, arg1?: any, arg2?: any): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    conn.once('error', reject);
    conn.once('listening', () => {
      conn.off('error', resolve);
      resolve(conn.address());
    });

    if (arg2 !== undefined) {
      conn.bind(arg1, arg2);
    } else {
      conn.bind(arg1);
    }
  });
}

/**
 * Async version of udp socket read
 */
export function udpRead(conn: Socket) {
  return new Promise<Buffer>(resolve => conn.once('message', resolve));
}

/**
 * Async version of udp socket send
 */
export function udpSend(
  conn: Socket,
  msg: Buffer | string | Uint8Array | any[],
  port: number,
  address: string
): Promise<number>;
export function udpSend(
  conn: Socket,
  msg: Buffer | string | Uint8Array,
  offset: number,
  length: number,
  port: number,
  address: string
): Promise<number>;
export function udpSend(
  conn: Socket,
  arg1: any,
  arg2: any,
  arg3: any,
  arg4?: any,
  arg5?: any
): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      if (arg4 !== undefined) {
        conn.send(arg1, arg2, arg3, arg4, arg5, (err, sent) =>
          err ? reject(err) : resolve(sent)
        );
      } else {
        conn.send(arg1, arg2, arg3, (err, sent) => (err ? reject(err) : resolve(sent)));
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Async version of udp socket close
 */
export function udpClose(conn: Socket) {
  return new Promise((resolve, reject) => {
    try {
      conn.once('close', resolve);
      conn.close();
    } catch (err) {
      reject(err);
    }
  });
}
