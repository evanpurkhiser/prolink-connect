import {PromiseReadable} from 'promise-readable';

const NULL_CHAR = '\0';

/**
 * Field type is a leading byte that indicates what the field is.
 */
export enum FieldType {
  UInt8 = 0x0f,
  UInt16 = 0x10,
  UInt32 = 0x11,
  Binary = 0x14,
  String = 0x26,
}

/**
 * The generic interface for all field types
 */
export interface BaseField {
  /**
   * The raw field data
   */
  data: Buffer;
  /**
   * Corce the field into a buffer. This differs from reading the data
   * property in that it will include the field type header.
   */
  readonly buffer: Buffer;
}

export class BaseField {
  /**
   * Declares the type of field this class represents
   */
  static type: FieldType;

  /**
   * The number of bytes to read for this field. If the field is not a fixed size,
   * set this to a function which will receive the UInt32 value just after
   * reading the field type, returning the next number of bytes to read.
   */
  static bytesToRead: number | ((reportedLength: number) => number);

  // The constructor property (which is used to access the class from an
  // instance of it) must be set to the BaseClass object so we can access the
  // `.type` property.
  //
  // @see https://github.com/Microsoft/TypeScript/issues/3841#issuecomment-337560146
  //
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  ['constructor']: typeof BaseField;
}

export type NumberField<T extends number = number> = BaseField & {
  /**
   * The fields number value
   */
  value: T;
};

export type StringField<T extends string = string> = BaseField & {
  /**
   * The fields decoded string value
   */
  value: T;
};

export type BinaryField = BaseField & {
  /**
   * The binary value encapsulated in the field
   */
  value: Buffer;
};

export type Field = NumberField | StringField | BinaryField;

type NumberFieldType = FieldType.UInt32 | FieldType.UInt16 | FieldType.UInt8;

const numberNameMap = Object.fromEntries(
  Object.entries(FieldType).map(e => [e[1], e[0]])
);

const numberBufferInfo = {
  [FieldType.UInt8]: [1, 'writeUInt8', 'readUInt8'],
  [FieldType.UInt16]: [2, 'writeUInt16BE', 'readUInt16BE'],
  [FieldType.UInt32]: [4, 'writeUInt32BE', 'readUInt32BE'],
} as const;

function parseNumber(value: number | Buffer, type: NumberFieldType): [number, Buffer] {
  const [bytes, writeFn, readFn] = numberBufferInfo[type];
  const data = Buffer.alloc(bytes);

  if (typeof value === 'number') {
    data[writeFn](value);
    return [value, data];
  }

  return [value[readFn](), value];
}

function makeVariableBuffer(type: FieldType, fieldData: Buffer, lengthHeader?: number) {
  // Add 4 bytes for length header and 1 byte for type header.
  const data = Buffer.alloc(fieldData.length + 4 + 1);
  data.writeUInt8(type);
  data.writeUInt32BE(lengthHeader ?? fieldData.length, 0x01);

  fieldData.copy(data, 0x05);

  return data;
}

const makeNumberField = (type: NumberFieldType) => {
  const Number = class extends BaseField implements NumberField {
    static type = type;
    static bytesToRead = numberBufferInfo[type][0];

    value: number;

    constructor(value: number | Buffer) {
      super();
      const [number, data] = parseNumber(value, type);
      this.data = data;
      this.value = number;
    }

    get buffer() {
      return Buffer.from([type, ...this.data]);
    }
  };

  // We use the name property in readField to create helpful error messages
  Object.defineProperty(Number, 'name', {value: numberNameMap[type]});

  return Number;
};

/**
 * Field representing a UInt8
 */
export const UInt8 = makeNumberField(FieldType.UInt8);

/**
 * Field representing a UInt16
 */
export const UInt16 = makeNumberField(FieldType.UInt16);

/**
 * Field representing a UInt32
 */
export const UInt32 = makeNumberField(FieldType.UInt32);

/**
 * Field representing a null-terminated big endian UTF-16 string
 */
export class String extends BaseField implements StringField {
  static type = FieldType.String as const;

  // Compute the number of bytes in the string given the length of the string.
  // A UTF-16 string takes 2 bytes per character.
  static bytesToRead = (length: number) => length * 2;

  value: string;

  constructor(value: Buffer | string) {
    super();
    if (typeof value === 'string') {
      this.value = value;
      this.data = Buffer.from(value + NULL_CHAR, 'utf16le').swap16();
      return;
    }

    // Slice off the last two bytes to remove the trailing null bytes
    this.value = Buffer.from(value).swap16().slice(0, -2).toString('utf16le');
    this.data = value;
  }

  get buffer() {
    return makeVariableBuffer(FieldType.String, this.data, this.data.length / 2);
  }
}

/**
 * Field representing binary data
 */
export class Binary extends BaseField implements BinaryField {
  static type = FieldType.Binary as const;
  static bytesToRead = (bytes: number) => bytes;

  value: Buffer;

  constructor(value: Buffer) {
    super();
    this.value = this.data = value;
  }

  get buffer() {
    return makeVariableBuffer(FieldType.Binary, this.data);
  }
}

const fieldMap = {
  [FieldType.UInt8]: UInt8,
  [FieldType.UInt16]: UInt16,
  [FieldType.UInt32]: UInt32,
  [FieldType.Binary]: Binary,
  [FieldType.String]: String,
} as const;

/**
 * Helper to read from stream.
 *
 * NOTE: I suspect the typescript interface on PromiseReadable may be wrong, as
 * I'm not sure when this would return a string. We'll play it safe for now.
 */
async function read(stream: PromiseReadable<any>, bytes: number) {
  const data = await stream.read(bytes);

  if (data instanceof Buffer) {
    return data;
  }

  throw new Error('Expected buffer from stream read');
}

/**
 * Read a single field from a socket stream.
 */
export async function readField<
  T extends FieldType,
  F extends InstanceType<(typeof fieldMap)[T]>,
>(stream: PromiseReadable<any>, expect: T): Promise<F> {
  const typeData = await read(stream, 1);
  const Field = fieldMap[typeData[0] as FieldType];

  if (Field.type !== expect) {
    throw new Error(`Expected ${fieldMap[expect].name} but got ${Field.name}`);
  }

  let nextByteCount: number;

  if (typeof Field.bytesToRead === 'number') {
    nextByteCount = Field.bytesToRead;
  } else {
    // Read the field length as a UInt32 when we do not know the field length
    // from the type
    const lengthData = await read(stream, 4);
    nextByteCount = Field.bytesToRead(lengthData.readUInt32BE());
  }

  const data = nextByteCount === 0 ? Buffer.alloc(0) : await read(stream, nextByteCount);

  return new Field(data) as F;
}
