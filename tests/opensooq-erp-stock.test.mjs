import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNextErpStock, readNextErpStock } from '../server/opensooq-erp-stock.ts';
import { buildOpenSooqSchedule, chooseOpenSooqUniqueModelRows, findOpenSooqDuplicateModelDays,
  openSooqModelIdentity, rebuildOpenSooqUnpublishedRows } from '../src/opensooq.ts';

const item = (code, type, stockClass, model) => ({
  name: code, item_code: code, item_name: `${type} ${stockClass} ${model}`,
  type, class: stockClass, model, disabled: 0, is_sales_item: 1,
});
const serial = (vin, code, status = 'Active', carStatus = 'متاحة للحجز') => ({
  name: vin, item_code: code, status, car_status: carStatus,
});

test('NEXT ERP maps only actual active available Serial No units to exact Item type/class/model', () => {
  const result = mapNextErpStock([
    item('ITEM-1', 'اكسنت', 'فليت 1500 سي سي - L', '2027'),
    item('ITEM-2', 'اكسنت', 'سمارت 1500 سي سي - GL', '2027'),
    { ...item('DISABLED', 'سوناتا', 'سمارت', '2026'), disabled: 1 },
  ], [
    serial('VIN001', 'ITEM-1'), serial('VIN002', 'ITEM-1'),
    serial('VIN003', 'ITEM-2'), serial('VIN004', 'ITEM-1', 'Inactive'),
    serial('VIN005', 'ITEM-1', 'Active', 'محجوزة'),
    serial('VIN006', 'DISABLED'), serial('VIN007', 'NOT_FOUND'),
  ]);
  assert.equal(result.totalVehicles, 3);
  assert.equal(result.totalGroups, 2);
  assert.equal(result.excludedUnmapped, 2);
  assert.equal(result.excludedUnavailable, 2);
  assert.equal(result.rows.find((row) => row.statement.includes('فليت')).quantity, 2);
  assert.equal(result.rows.find((row) => row.statement.includes('سمارت')).quantity, 1);
  assert.equal(new Set(result.rows.flatMap((row) => row.unitKeys)).size, 3);
  assert.equal(JSON.stringify(result).includes('VIN001'), false, 'raw VIN must not be sent to client');
});

test('same variant in different NEXT ERP Item codes remains one publishing variant', () => {
  const result = mapNextErpStock([
    item('CODE-A', 'اكسنت', 'فليت L', '2027'),
    item('CODE-B', 'اكسنت', 'فليت L', '2027'),
  ], [serial('VIN001', 'CODE-A'), serial('VIN002', 'CODE-B')]);
  assert.equal(result.totalGroups, 1);
  assert.equal(result.rows[0].quantity, 2);
  assert.deepEqual(mapNextErpStock([
    item('CODE-B', 'اكسنت', 'فليت L', '2027'), item('CODE-A', 'اكسنت', 'فليت L', '2027'),
  ], [serial('VIN002', 'CODE-B'), serial('VIN001', 'CODE-A')]).rows, result.rows,
    'ERPNext list pagination and order must not change stable stock/serial IDs');
});

test('missing Item type/class/model never falls back to guessed item_name', () => {
  const result = mapNextErpStock([
    { ...item('BAD', 'اكسنت', 'فليت', '2027'), class: '' },
  ], [serial('VIN001', 'BAD')]);
  assert.equal(result.totalVehicles, 0);
  assert.equal(result.excludedUnmapped, 1);
});

test('eight identical available NEXT ERP vehicles create only one ad per day, not eight ads on one day', () => {
  const stock = mapNextErpStock([item('ACCENT', 'اكسنت', 'فليت 1500 سي سي - L', '2027')],
    Array.from({ length: 8 }, (_, i) => serial(`VIN-${i + 1}`, 'ACCENT'))).rows.map((row) => ({ ...row, price: 75785 }));
  const days = ['2026-10-27', '2026-10-28', '2026-10-29'].map((key) => ({ key, name: key }));
  const schedule = buildOpenSooqSchedule(days, 14, 42, stock, [], '0547777703');
  assert.equal(schedule.length, 3);
  assert.deepEqual(days.map(({ key }) => schedule.filter((row) => row.scheduledDate === key).length), [1, 1, 1]);
  assert.equal(new Set(schedule.map((row) => row.id)).size, 3);
  assert.equal(schedule.every((row) => row.stockSource === 'next_erp'), true);
});

test('14 different variants per day still distribute 7/7 and do not repeat one variant on a day', () => {
  const items = Array.from({ length: 20 }, (_, i) => item(`ITEM-${i}`, `سيارة ${i}`, `فئة ${i}`, '2026'));
  const serials = items.flatMap((itemRow, i) => [serial(`VIN-${i}-1`, itemRow.item_code), serial(`VIN-${i}-2`, itemRow.item_code)]);
  const stock = mapNextErpStock(items, serials).rows.map((row) => ({ ...row, price: 90000 }));
  const schedule = buildOpenSooqSchedule([
    { key: '2026-10-27', name: 'الثلاثاء' }, { key: '2026-10-28', name: 'الأربعاء' },
  ], 14, 28, stock, [], '0547777703');
  assert.equal(schedule.length, 28);
  for (const day of ['2026-10-27', '2026-10-28']) {
    const rows = schedule.filter((row) => row.scheduledDate === day);
    assert.equal(rows.length, 14);
    assert.equal(new Set(rows.map((row) => row.stockKey)).size, 14);
    assert.equal(rows.filter((row) => row.branchId === 'showroom').length, 7);
    assert.equal(rows.filter((row) => row.branchId === 'qadisiyah').length, 7);
  }
});


test('saved eight identical unpublished rows can be replaced with eight distinct NEXT ERP variants without altering quota, dates or branches', () => {
  const old = Array.from({ length: 8 }, (_, i) => ({
    id: `old-accent:${i + 1}`, stockKey: 'old-accent', unitIndex: i + 1,
    carName: 'اكسنت', statement: 'فليت L', modelYear: '2027',
    scheduledDate: '2026-10-29', order: i + 1, branchId: i % 2 ? 'qadisiyah' : 'showroom',
    price: 75785, phone: '0547777703', status: 'scheduled',
  }));
  const items = Array.from({ length: 12 }, (_, i) => item(`ITEM-${i}`, `سيارة ${i}`, `فئة ${i}`, '2026'));
  const erp = mapNextErpStock(items, items.map((itemRow, i) => serial(`VIN-${i}`, itemRow.item_code)))
    .rows.map((row) => ({ ...row, price: 80000 }));
  const original = structuredClone(old);
  const replacement = rebuildOpenSooqUnpublishedRows(old, erp, old.map((row) => row.id));
  assert.deepEqual(old, original, 'preview cannot mutate existing plan');
  assert.equal(replacement.length, 8);
  assert.equal(new Set(replacement.map((row) => row.stockKey)).size, 8);
  assert.equal(new Set(replacement.map((row) => row.id)).size, 8);
  replacement.forEach((row, i) => {
    assert.equal(row.scheduledDate, old[i].scheduledDate);
    assert.equal(row.order, old[i].order);
    assert.equal(row.branchId, old[i].branchId);
    assert.equal(row.phone, old[i].phone);
    assert.equal(row.stockSource, 'next_erp');
  });
});

test('saved published row is never replaced and its variant is excluded from replacements', () => {
  const old = [
    { id: 'already-published', stockKey: 'old', unitIndex: 1, carName: 'اكسنت', statement: 'فليت', modelYear: '2027',
      scheduledDate: '2026-10-29', order: 1, branchId: 'showroom', price: 75785, phone: '0547777703', status: 'published' },
    { id: 'old:2', stockKey: 'old', unitIndex: 2, carName: 'اكسنت', statement: 'فليت', modelYear: '2027',
      scheduledDate: '2026-10-29', order: 2, branchId: 'qadisiyah', price: 75785, phone: '0547777703', status: 'scheduled' },
  ];
  const erp = mapNextErpStock([
    item('ACCENT', 'اكسنت', 'فليت', '2027'), item('SONATA', 'سوناتا', 'سمارت', '2026'),
  ], [serial('VIN-1', 'ACCENT'), serial('VIN-2', 'SONATA')]).rows.map((row) => ({ ...row, price: 90000 }));
  const replacement = rebuildOpenSooqUnpublishedRows(old, erp, old.map((row) => row.id));
  assert.deepEqual(replacement[0], old[0]);
  assert.equal(replacement[1].carName, 'سوناتا');
  assert.equal(replacement[1].branchId, 'qadisiyah');
});

test('rebuilding a saved plan fails completely when NEXT ERP has too few different variants', () => {
  const old = Array.from({ length: 8 }, (_, i) => ({
    id: `old:${i + 1}`, stockKey: 'old', unitIndex: i + 1, carName: 'اكسنت', statement: 'فليت', modelYear: '2027',
    scheduledDate: '2026-10-29', order: i + 1, branchId: i % 2 ? 'qadisiyah' : 'showroom',
    price: 75785, phone: '0547777703', status: 'scheduled',
  }));
  const erp = mapNextErpStock([item('ACCENT', 'اكسنت', 'فليت', '2027')],
    Array.from({ length: 8 }, (_, i) => serial(`VIN-${i}`, 'ACCENT'))).rows.map((row) => ({ ...row, price: 75785 }));
  assert.throws(() => rebuildOpenSooqUnpublishedRows(old, erp, old.map((row) => row.id)), /لم يتغير الجدول أو الرصيد/);
});


test('verified six-field Item records without sales/disabled flags still map to real stock', () => {
  const sixFieldItem = { item_code: '27-D639-1.5', item_name: 'اكسنت فليت', item_group: 'هيونداي',
    type: 'اكسنت', class: 'فليت 1500 سي سي', model: '2027' };
  const result = mapNextErpStock([sixFieldItem], [serial('VIN-1', sixFieldItem.item_code)]);
  assert.equal(result.totalVehicles, 1);
  assert.equal(result.totalGroups, 1);
  assert.equal(result.excludedUnmapped, 0);
});

test('two trims of the same car and model year NEVER appear together on the same day across branches', () => {
  const items = [
    item('ACCENT-FLEET', 'اكسنت', 'فليت 1500 سي سي', '2027'),
    item('ACCENT-SMART', 'اكسنت', 'سمارت 1500 سي سي', '2027'),
    item('SONATA', 'سوناتا', 'سمارت 2500 سي سي', '2026'),
  ];
  const serials = items.flatMap((entry, i) => Array.from({ length: 3 }, (_, n) => serial(`VIN-${i}-${n}`, entry.item_code)));
  const stock = mapNextErpStock(items, serials).rows.map((row) => ({ ...row, price: 90000 }));
  const days = ['2026-10-27', '2026-10-28', '2026-10-29'].map((key) => ({ key, name: key }));
  const rows = buildOpenSooqSchedule(days, 14, 42, stock, [], '0547777703');
  assert.equal(rows.length, 6);
  for (const { key } of days) {
    const daily = rows.filter((row) => row.scheduledDate === key);
    assert.equal(daily.length, 2, 'only Accent and Sonata may appear each day');
    assert.equal(new Set(daily.map(openSooqModelIdentity)).size, daily.length);
    assert.equal(daily.filter((row) => row.carName === 'اكسنت').length, 1);
  }
});

test('published car blocks a different trim of the same model on that date', () => {
  const stock = mapNextErpStock([
    item('ACCENT-SMART', 'اكسنت', 'سمارت', '2027'), item('SONATA', 'سوناتا', 'سمارت', '2026'),
  ], [serial('VIN-1', 'ACCENT-SMART'), serial('VIN-2', 'SONATA')]).rows.map((row) => ({ ...row, price: 90000 }));
  const blocked = [{ scheduledDate: '2026-10-29', carName: 'اكسنت', statement: 'فليت', modelYear: '2027' }];
  const rows = buildOpenSooqSchedule([{ key: '2026-10-29', name: 'الخميس' }], 14, 14,
    stock, [], '0547777703', blocked);
  assert.deepEqual(rows.map((row) => row.carName), ['سوناتا']);
});

test('identity normalizes Arabic spelling and separators, and detects legacy duplicate plans', () => {
  assert.equal(openSooqModelIdentity({ carName: 'إكس - تريل', modelYear: '2026' }),
    openSooqModelIdentity({ carName: 'اكس تريل', modelYear: '2026' }));
  const rows = [
    { scheduledDate: '2026-10-29', carName: 'اكسنت', modelYear: '2027', statement: 'فليت', status: 'scheduled', order: 1 },
    { scheduledDate: '2026-10-29', carName: 'اكسنت', modelYear: '2027', statement: 'سمارت', status: 'published', order: 2 },
    { scheduledDate: '2026-10-29', carName: 'سوناتا', modelYear: '2026', statement: 'سمارت', status: 'scheduled', order: 3 },
  ];
  assert.deepEqual(findOpenSooqDuplicateModelDays(rows), ['2026-10-29']);
  assert.deepEqual(chooseOpenSooqUniqueModelRows(rows), { keepIndices: [1, 2], publishedConflictDays: [] });
  assert.deepEqual(chooseOpenSooqUniqueModelRows([{ ...rows[0], status: 'published' }, rows[1]]).publishedConflictDays,
    ['2026-10-29']);
});

test('23 trims belonging to 13 car models never produce 14 daily ads', () => {
  const items = Array.from({ length: 23 }, (_, i) => item(`CODE-${i}`, `نوع ${i % 13}`, `فئة ${i}`, '2026'));
  const serials = items.flatMap((entry, i) => Array.from({ length: i < 7 ? 6 : 5 }, (_, n) => serial(`VIN-${i}-${n}`, entry.item_code)));
  assert.equal(serials.length, 122);
  const stock = mapNextErpStock(items, serials).rows.map((row) => ({ ...row, price: 90000 }));
  assert.equal(stock.length, 23);
  const rows = buildOpenSooqSchedule([{ key: '2026-10-27', name: 'الثلاثاء' }], 14, 14,
    stock, [], '0547777703');
  assert.equal(rows.length, 13);
  assert.equal(new Set(rows.map(openSooqModelIdentity)).size, 13);
  assert.equal(rows.filter((row) => row.branchId === 'showroom').length, 7);
  assert.equal(rows.filter((row) => row.branchId === 'qadisiyah').length, 6);
});

test('Postman-compatible Frappe reader pulls 122 VINs and 23 linked Items using message, never data', async () => {
  const items = Array.from({ length: 23 }, (_, i) => ({
    item_code: `ITEM-${i}`, item_name: `سيارة ${i}`, item_group: 'هيونداي',
    type: `نوع ${i % 13}`, class: `فئة ${i}`, model: '2026',
  }));
  const serials = items.flatMap((entry, i) => Array.from({ length: i < 7 ? 6 : 5 }, (_, n) => serial(`VIN-${i}-${n}`, entry.item_code)));
  const calls = [];
  const fakeFetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push(parsed);
    assert.equal(parsed.pathname, '/api/method/frappe.client.get_list');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.authorization, 'token key:secret');
    const doctype = parsed.searchParams.get('doctype');
    const fields = JSON.parse(parsed.searchParams.get('fields'));
    const filters = JSON.parse(parsed.searchParams.get('filters'));
    const start = Number(parsed.searchParams.get('limit_start'));
    const count = Number(parsed.searchParams.get('limit_page_length'));
    assert.equal(count, 200);
    if (doctype === 'Serial No') {
      assert.deepEqual(fields, ['name', 'item_code', 'status', 'car_status']);
      assert.deepEqual(filters, [['car_status', '=', 'متاحة للحجز'], ['status', '=', 'Active']]);
      return new Response(JSON.stringify({ message: serials.slice(start, start + count) }), { status: 200 });
    }
    assert.equal(doctype, 'Item');
    assert.deepEqual(fields, ['item_code', 'item_name', 'item_group', 'type', 'class', 'model']);
    const requested = filters[0][2];
    return new Response(JSON.stringify({ message: items.filter((itemRow) => requested.includes(itemRow.item_code)).slice(start, start + count) }), { status: 200 });
  };
  const result = await readNextErpStock('https://mzj2.newworldinfosys.com', 'token key:secret', fakeFetch);
  assert.equal(result.totalVehicles, 122);
  assert.equal(result.totalGroups, 23);
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(result).includes('VIN-'), false);
});

test('Frappe reader paginates Serial Nos and splits Item queries into small batches', async () => {
  const items = Array.from({ length: 42 }, (_, i) => ({
    item_code: `ITEM-${i}`, type: `نوع ${i}`, class: `فئة ${i}`, model: '2026', item_group: 'هيونداي', item_name: `نوع ${i}`,
  }));
  const serials = Array.from({ length: 225 }, (_, i) => serial(`VIN-${i}`, items[i % 42].item_code));
  const counts = { serial: 0, item: 0 };
  const fakeFetch = async (url) => {
    const parsed = new URL(url);
    const start = Number(parsed.searchParams.get('limit_start'));
    const size = Number(parsed.searchParams.get('limit_page_length'));
    const doctype = parsed.searchParams.get('doctype');
    if (doctype === 'Serial No') {
      counts.serial++;
      return new Response(JSON.stringify({ message: serials.slice(start, start + size) }), { status: 200 });
    }
    counts.item++;
    const codes = JSON.parse(parsed.searchParams.get('filters'))[0][2];
    return new Response(JSON.stringify({ message: items.filter((entry) => codes.includes(entry.item_code)).slice(start, start + size) }), { status: 200 });
  };
  const result = await readNextErpStock('https://mzj2.newworldinfosys.com', 'token key:secret', fakeFetch);
  assert.equal(result.totalVehicles, 225);
  assert.equal(result.totalGroups, 42);
  assert.equal(counts.serial, 2);
  assert.equal(counts.item, 2);
});

test('ERP failure exposes only HTTP status, not secret or remote HTML', async () => {
  const fakeFetch = async () => new Response('<html>forbidden</html>', { status: 403 });
  await assert.rejects(readNextErpStock('https://mzj2.newworldinfosys.com', 'token key:secret', fakeFetch),
    /ERP_SERIAL_NO_HTTP_403/);
});
