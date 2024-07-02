import {Span, SpanStatus} from '@sentry/tracing';
import {PromiseReadable} from 'promise-readable';

import {REMOTEDB_MAGIC} from 'src/remotedb/constants';
import {
  Binary,
  Field,
  FieldType,
  readField,
  UInt8,
  UInt16,
  UInt32,
} from 'src/remotedb/fields';
import {responseTransform} from 'src/remotedb/message/response';
import {getMessageName, MessageType, Response} from 'src/remotedb/message/types';

/**
 * Argument types are used in argument list fields. This is essentially
 * duplicating the field type, but has different values for whatever reason.
 *
 * There do not appear to be argument types for UInt8 and UInt16. At least, no
 * messages include these field types as arguments as far as we know.
 */
enum ArgumentType {
  String = 0x02,
  Binary = 0x03,
  UInt32 = 0x06,
}

/**
 * The message argument list always contains 12 slots
 */
const ARG_COUNT = 12;

const fieldArgsMap = {
  [FieldType.UInt32]: ArgumentType.UInt32,
  [FieldType.String]: ArgumentType.String,
  [FieldType.Binary]: ArgumentType.Binary,

  // The following two field types do not have associated argument types (see
  // the note in ArgumentType), but we declare them here to make typescript happy
  // when mapping these values over.
  [FieldType.UInt8]: 0x00,
  [FieldType.UInt16]: 0x00,
};

const argsFieldMap = {
  [ArgumentType.UInt32]: FieldType.UInt32,
  [ArgumentType.String]: FieldType.String,
  [ArgumentType.Binary]: FieldType.Binary,
};

interface Options<T extends MessageType> {
  transactionId?: number;
  type: T;
  args: Field[];
}

type ResponseType<T> = T extends Response ? T : never;
type Data<T> = ReturnType<(typeof responseTransform)[ResponseType<T>]>;

/**
 * Representation of a set of fields sequenced into a known message format.
 */
export class Message<T extends MessageType = MessageType> {
  /**
   * Read a single mesasge via a readable stream
   */
  static async fromStream<T extends Response>(
    stream: PromiseReadable<any>,
    expect: T,
    span: Span
  ) {
    const tx = span.startChild({
      op: 'readFromStream',
      description: getMessageName(expect),
    });

    // 01. Read magic bytes
    const magicHeader = await readField(stream, FieldType.UInt32);

    if (magicHeader.value !== REMOTEDB_MAGIC) {
      throw new Error('Did not receive expected magic value. Corrupt message');
    }

    // 02. Read transaction ID
    const txId = await readField(stream, FieldType.UInt32);

    // 03. Read message type
    const messageType = await readField(stream, FieldType.UInt16);

    // 04. Read argument count
    const argCount = await readField(stream, FieldType.UInt8);

    // 05. Read argument list
    const argList = await readField(stream, FieldType.Binary);

    // 06. Read all argument fields in
    const args: Field[] = new Array(argCount.value);

    for (let i = 0; i < argCount.value; ++i) {
      // XXX: There is a small quirk in a few message response types that send
      //      binary data, but if the binary data is empty the field will not
      //      be sent.
      if (argList.value[i] === ArgumentType.Binary && args[i - 1]?.value === 0) {
        args[i] = new Binary(Buffer.alloc(0));
        continue;
      }

      args[i] = await readField(stream, argsFieldMap[argList.value[i] as ArgumentType]);
    }

    if (messageType.value !== expect) {
      const expected = expect.toString(16);
      const actual = messageType.value.toString(16);

      tx.setStatus(SpanStatus.FailedPrecondition);
      tx.finish();

      throw new Error(`Expected message type 0x${expected}, got 0x${actual}`);
    }

    tx.finish();

    return new Message({
      transactionId: txId.value,
      type: messageType.value as T,
      args,
    });
  }

  /**
   * The transaction ID is used to associate responses to their requests.
   */
  transactionId?: number;

  readonly type: T;
  readonly args: Field[];

  constructor({transactionId, type, args}: Options<T>) {
    this.transactionId = transactionId;
    this.type = type;
    this.args = args;
  }

  /**
   * The byte serialization of the message
   */
  get buffer() {
    // Determine the argument list from the list of fields
    const argList = Buffer.alloc(ARG_COUNT, 0x00);
    argList.set(this.args.map(arg => fieldArgsMap[arg.constructor.type]));

    // XXX: Following the parsing quirk for messages that contain binary data
    //      but are _empty_, we check for binary fields with UInt32 fields
    //      before with the value of 0 (indicating "an empty binary field").
    const args = this.args.reduce<Field[]>((args, arg, i) => {
      const prevArg = this.args[i - 1];

      const isEmptyBuffer =
        arg.constructor.type === FieldType.Binary &&
        i !== 0 &&
        prevArg.constructor.type === FieldType.UInt32 &&
        prevArg.value === 0;

      return isEmptyBuffer ? args : [...args, arg];
    }, []);

    const fields = [
      new UInt32(REMOTEDB_MAGIC),
      new UInt32(this.transactionId ?? 0),
      new UInt16(this.type),
      new UInt8(this.args.length),
      new Binary(argList),
      ...args,
    ];

    return Buffer.concat(fields.map(f => f.buffer));
  }

  /**
   * The JS representation of the message.
   *
   * Currently only supports representing response messages.
   */
  get data(): Data<T> {
    const type = this.type as ResponseType<T>;

    if (!Object.values(Response).includes(type)) {
      throw new Error('Representation of non-responses is not currently supported');
    }

    return responseTransform[type](this.args) as Data<T>;
  }
}
