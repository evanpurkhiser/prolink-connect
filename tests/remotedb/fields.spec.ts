import PromiseReadable from 'promise-readable';
import {ReadableStreamBuffer} from 'stream-buffers';

import * as Field from 'src/remotedb/fields';

describe('UInt8', () => {
  let num: Field.NumberField;

  afterEach(() => {
    expect(num.value).toBe(5);
    expect(num.data).toHaveLength(1);
    expect(num.data[0]).toBe(0x05);
    expect(num.buffer).toHaveLength(2);
    expect(num.buffer[0]).toBe(Field.FieldType.UInt8);
  });

  it('encodes', () => {
    num = new Field.UInt8(5);
  });

  it('decodes', () => {
    num = new Field.UInt8(Buffer.of(0x05));
  });
});

describe('UInt16', () => {
  let num: Field.NumberField;

  afterEach(() => {
    expect(num.value).toBe(5);
    expect(num.data).toHaveLength(2);
    expect([...num.data]).toEqual([0x00, 0x05]);
    expect(num.buffer).toHaveLength(3);
    expect(num.buffer[0]).toBe(Field.FieldType.UInt16);
  });

  it('encodes', () => {
    num = new Field.UInt16(5);
  });

  it('decodes', () => {
    num = new Field.UInt16(Buffer.of(0x00, 0x05));
  });
});

describe('UInt32', () => {
  let num: Field.NumberField;

  afterEach(() => {
    expect(num.value).toBe(5);
    expect(num.data).toHaveLength(4);
    expect([...num.data]).toEqual([0x00, 0x00, 0x00, 0x05]);
    expect(num.buffer).toHaveLength(5);
    expect(num.buffer[0]).toBe(Field.FieldType.UInt32);
  });

  it('encodes', () => {
    num = new Field.UInt32(5);
  });

  it('decodes', () => {
    num = new Field.UInt32(Buffer.of(0x00, 0x00, 0x00, 0x05));
  });
});

describe('String', () => {
  let string: Field.StringField;

  afterEach(() => {
    expect(string.value).toBe('test');
    expect(string.data).toHaveLength(10);
    // prettier-ignore
    expect([...string.data]).toEqual([0x00, 0x74, 0x00, 0x65, 0x00, 0x73, 0x00, 0x74, 0x00, 0x00]);
    expect(string.buffer).toHaveLength(15);
    expect(string.buffer[0]).toBe(Field.FieldType.String);
  });

  it('encodes', () => {
    string = new Field.String('test');
  });

  it('decodes', () => {
    string = new Field.String(
      Buffer.of(0x00, 0x74, 0x00, 0x65, 0x00, 0x73, 0x00, 0x74, 0x00, 0x00)
    );
  });
});

describe('Binary', () => {
  let string: Field.BinaryField;

  afterEach(() => {
    expect([...string.value]).toEqual([0x0a, 0x0b, 0x0c]);
    expect(string.data).toHaveLength(3);
    expect([...string.data]).toEqual([0x0a, 0x0b, 0x0c]);
    expect(string.buffer).toHaveLength(8);
    expect(string.buffer[0]).toBe(Field.FieldType.Binary);
  });

  it('encodes and decodes', () => {
    string = new Field.Binary(Buffer.of(0x0a, 0x0b, 0x0c));
  });
});

describe('readField', () => {
  const streamBuffer = new ReadableStreamBuffer();
  const socket = new PromiseReadable(streamBuffer);

  it('raises an error when the wrong field is read', async () => {
    streamBuffer.put(Buffer.of(Field.FieldType.UInt16));

    await expect(async () => {
      await Field.readField(socket, Field.FieldType.UInt8);
    }).rejects.toThrow('Expected UInt8 but got UInt16');
  });

  it('reads a fixed size integer', async () => {
    streamBuffer.put(Buffer.of(Field.FieldType.UInt8, 0x05));
    const data = await Field.readField(socket, Field.FieldType.UInt8);

    expect(data).toBeInstanceOf(Field.UInt8);
    expect(data.value).toBe(0x05);
  });

  it('reads a variable sized binary field', async () => {
    streamBuffer.put(
      Buffer.of(Field.FieldType.Binary, 0x00, 0x00, 0x00, 0x02, 0x01, 0x02)
    );
    const data = await Field.readField(socket, Field.FieldType.Binary);

    expect(data).toBeInstanceOf(Field.Binary);
    expect(data.value).toBeInstanceOf(Buffer);
    expect(data.value).toEqual(Buffer.of(0x01, 0x02));
  });

  it('does not read 0 length data of a empty binary field', async () => {
    streamBuffer.put(Buffer.of(Field.FieldType.Binary, 0x00, 0x00, 0x00, 0x00));
    const data = await Field.readField(socket, Field.FieldType.Binary);

    expect(data).toBeInstanceOf(Field.Binary);
    expect(data.value).toBeInstanceOf(Buffer);
    expect(data.value).toEqual(Buffer.of());
  });
});
