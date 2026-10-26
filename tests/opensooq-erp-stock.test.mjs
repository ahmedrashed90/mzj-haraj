import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNextErpStock } from '../server/opensooq-erp-stock.ts';
import { buildOpenSooqSchedule, rebuildOpenSooqUnpublishedRows } from '../src/opensooq.ts';

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
