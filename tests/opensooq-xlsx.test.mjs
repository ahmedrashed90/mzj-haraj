import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenSooqXlsx } from '../src/opensooq-xlsx.ts';

const labels = ['Date', 'Branch', 'Car', 'Description', 'Year', 'Price', 'Phone', 'Status'];
const sample = [
  { date: '2026-10-20', branch: 'B', car: 'Car B', statement: 'Variant 2', modelYear: '2026', price: 87000, phone: '0547777703', statusLabel: 'Pending', published: false, order: 2 },
  { date: '2026-10-19', branch: 'A', car: 'Car A', statement: '< & > =SUM(1,1)', modelYear: '2026', price: 119900, phone: '0547777703', statusLabel: 'Published', published: true, order: 1 },
  { date: '2026-10-19', branch: 'A', car: 'Car A', statement: 'Variant 1', modelYear: '2027', price: null, phone: '0012345', statusLabel: 'Pending', published: false, order: 2 },
  { date: '2026-10-21', branch: 'A', car: 'Car C', statement: 'Variant 3', modelYear: '2026', price: 125000, phone: '0555555555', statusLabel: 'Pending', published: false, order: 1 },
];

function unzipStored(bytes) {
  const result = new Map();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameSize = view.getUint16(offset + 26, true);
    const extraSize = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameSize));
    const dataOffset = offset + 30 + nameSize + extraSize;
    result.set(name, decoder.decode(bytes.subarray(dataOffset, dataOffset + size)));
    offset = dataOffset + size;
  }
  return result;
}

test('creates a genuine styled XLSX with a right-to-left frozen header and print settings', () => {
  const bytes = buildOpenSooqXlsx(sample, { headers: labels, sheetName: 'Schedule' });
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const files = unzipStored(bytes);
  assert.equal(files.size, 8);
  const sheet = files.get('xl/worksheets/sheet1.xml');
  const styles = files.get('xl/styles.xml');
  assert.match(sheet, /rightToLeft="1"/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /autoFilter ref="A1:H5"/);
  assert.match(sheet, /fitToWidth="1"/);
  assert.match(styles, /Tajawal/);
  assert.match(styles, /123C5B/);
  assert.match(styles, /E7F2FF/);
  assert.match(styles, /EAF6E5/);
  assert.match(styles, /FFF0E6/);
  assert.match(styles, /dd\/mm\/yyyy/);
});

test('exports dates in chronological groups and keeps phone as text and price as a number', () => {
  const files = unzipStored(buildOpenSooqXlsx(sample, { headers: labels, sheetName: 'Schedule' }));
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<c r="G2" s="\d+" t="inlineStr"><is><t xml:space="preserve">0547777703<\/t>/);
  assert.match(sheet, /<c r="G3" s="\d+" t="inlineStr"><is><t xml:space="preserve">0012345<\/t>/);
  assert.match(sheet, /<c r="F2" s="\d+"><v>119900<\/v><\/c>/);
  assert.match(sheet, /<c r="F3" s="\d+" t="inlineStr"><is><t xml:space="preserve"><\/t>/);
  assert.match(sheet, /&lt; &amp; &gt; =SUM\(1,1\)/);
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(sheet, /<c r="A2" s="\d+"><v>46314<\/v><\/c>/);
  assert.match(sheet, /<c r="A4" s="\d+"><v>46315<\/v><\/c>/);
});

test('does not export empty schedules or mismatched columns', () => {
  assert.throws(() => buildOpenSooqXlsx([], { headers: labels, sheetName: 'Schedule' }), /empty/);
  assert.throws(() => buildOpenSooqXlsx(sample, { headers: ['Date'], sheetName: 'Schedule' }), /eight/);
});

test('ZIP central directory uses a supported stored compression method', () => {
  const bytes = buildOpenSooqXlsx(sample, { headers: labels, sheetName: 'Schedule' });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  assert.equal(count, 8);
  let offset = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    assert.equal(view.getUint16(offset + 8, true), 0x0800);
    assert.equal(view.getUint16(offset + 10, true), 0);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
});

test('XLSX bytes are backed by an ordinary ArrayBuffer and can be downloaded as a Blob', async () => {
  const bytes = buildOpenSooqXlsx(sample, { headers: labels, sheetName: 'Schedule' });
  assert.ok(bytes.buffer instanceof ArrayBuffer);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(blob.size, bytes.byteLength);
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const roundTrip = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(roundTrip, bytes);
});
