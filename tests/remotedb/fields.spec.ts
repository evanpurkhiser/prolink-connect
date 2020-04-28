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
