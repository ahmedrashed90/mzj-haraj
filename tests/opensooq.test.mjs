import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignOpenSooqBranches, buildOpenSooqSchedule, getOpenSooqPlanDays, getOpenSooqRemaining,
  mergeOpenSooqAssignments,
  openSooqSaturday, selectOpenSooqVehicles,
} from '../src/opensooq.ts';

test('October 2026 starts on Monday for current week and skips both Fridays', () => {
  assert.equal(openSooqSaturday('2026-10-19'), '2026-10-17');
  assert.deepEqual(getOpenSooqPlanDays('2026-10', '2026-10-17', '2026-10-19').map((d) => d.key),
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.deepEqual(getOpenSooqPlanDays('2026-10', '2026-10-24', '2026-10-19').map((d) => d.key),
    ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
  assert.deepEqual(getOpenSooqPlanDays('2026-10', '2026-10-31', '2026-10-19').map((d) => d.key), ['2026-10-31']);
});

test('weeks are clipped at month boundary, excluding Friday', () => {
  assert.deepEqual(getOpenSooqPlanDays('2026-11', '2026-10-31', '2026-10-19').map((d) => d.key),
    ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(getOpenSooqPlanDays('2026-10', '2026-10-17', '2026-10-23'), []);
});

test('147 balance is exhausted in 56 + 84 + 7 reserved weekly slots', () => {
  const month = { monthlyLimit: 160, activeCount: 13, reservedCount: 0 };
  assert.equal(getOpenSooqRemaining(month), 147);
  month.reservedCount += 56;
  assert.equal(getOpenSooqRemaining(month), 91);
  month.reservedCount += 84;
  assert.equal(getOpenSooqRemaining(month), 7);
  month.reservedCount += 7;
  assert.equal(getOpenSooqRemaining(month), 0);
});

test('separate statements are never merged; quantity controls rows', () => {
  const vehicles = [
    { key: 'accent-smart', carName: 'اكسنت', statement: 'سمارت GL', modelYear: '2026', quantity: 3, statusName: 'متاح للبيع', price: 72000 },
    { key: 'accent-fleet', carName: 'اكسنت', statement: 'فليت L', modelYear: '2026', quantity: 1, statusName: 'متاح للبيع', price: 65000 },
  ];
  const result = selectOpenSooqVehicles(vehicles, [], 14);
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map((r) => r.unitKey)).size, 4);
  assert.equal(result.filter((r) => r.statement === 'سمارت GL').length, 3);
  assert.equal(result.filter((r) => r.statement === 'فليت L').length, 1);
  assert.deepEqual(selectOpenSooqVehicles(vehicles, result.map((r) => r.unitKey), 14), []);
});

test('manual week schedule respects daily target, remaining quota and reserved units', () => {
  const vehicles = Array.from({length: 110}, (_, i) => ({
    key: `car-${i}`, carName: `السيارة ${i}`, statement: `الفئة ${i}`, modelYear: '2026',
    quantity: 1, statusName: 'متاح للبيع', price: 90000 + i,
  }));
  const days = getOpenSooqPlanDays('2026-10', '2026-10-24', '2026-10-19');
  const rows = buildOpenSooqSchedule(days, 14, 40, vehicles, [], '0501234567');
  assert.equal(rows.length, 40);
  assert.deepEqual(days.map((d) => rows.filter((r) => r.scheduledDate === d.key).length), [14,14,12,0,0,0]);
  const next = buildOpenSooqSchedule(days, 14, 80, vehicles, rows.map((r) => r.id), '0501234567');
  assert.equal(next.length, 70);
  assert.equal(next.every((r) => !rows.some((a) => a.id === r.id)), true);
});


test('October daily 14 ads split 7/7 across the two branch managers', () => {
  const vehicles = Array.from({length: 147}, (_, i) => ({
    key: `stock-${i}`, carName: `سيارة ${i}`, statement: `فئة ${i}`, modelYear: '2026',
    quantity: 1, statusName: 'متاح للبيع', price: 85000,
  }));
  const firstWeek = buildOpenSooqSchedule(getOpenSooqPlanDays('2026-10', '2026-10-17', '2026-10-19'),
    14, 147, vehicles, [], '0501234567');
  assert.equal(firstWeek.length, 56);
  for (const date of new Set(firstWeek.map((row) => row.scheduledDate))) {
    assert.equal(firstWeek.filter((row) => row.scheduledDate === date && row.branchId === 'showroom').length, 7);
    assert.equal(firstWeek.filter((row) => row.scheduledDate === date && row.branchId === 'qadisiyah').length, 7);
  }
  const secondWeek = buildOpenSooqSchedule(getOpenSooqPlanDays('2026-10', '2026-10-24', '2026-10-19'),
    14, 91, vehicles, firstWeek.map((row) => row.id), '0501234567');
  assert.equal(secondWeek.length, 84);
  const lastDay = buildOpenSooqSchedule(getOpenSooqPlanDays('2026-10', '2026-10-31', '2026-10-19'),
    14, 7, vehicles, [...firstWeek, ...secondWeek].map((row) => row.id), '0501234567');
  assert.equal(lastDay.length, 7);
  assert.equal(lastDay.filter((row) => row.branchId === 'showroom').length, 4);
  assert.equal(lastDay.filter((row) => row.branchId === 'qadisiyah').length, 3);
  assert.equal([...firstWeek, ...secondWeek, ...lastDay].length, 147);
  assert.equal(new Set([...firstWeek, ...secondWeek, ...lastDay].map((row) => row.id)).size, 147);
});

test('November daily 12 ads split 6/6 without changing October schedules', () => {
  const vehicles = Array.from({length: 30}, (_, i) => ({
    key: `car-${i}`, carName: `سيارة ${i}`, statement: `الفئة ${i}`, modelYear: '2026',
    quantity: 1, statusName: 'متاح للبيع', price: 90000,
  }));
  const rows = buildOpenSooqSchedule([{key: '2026-11-01', name: 'الأحد'}], 12, 160, vehicles, [], '0501234567');
  assert.equal(rows.length, 12);
  assert.equal(rows.filter((row) => row.branchId === 'showroom').length, 6);
  assert.equal(rows.filter((row) => row.branchId === 'qadisiyah').length, 6);
});

test('previously saved schedule can be divided without changing status, price, phone, date, id or quota', () => {
  const original = Array.from({length: 14}, (_, i) => ({
    id: `car:${i + 1}`, stockKey: 'car', unitIndex: i + 1,
    carName: 'سيارة', statement: 'فئة', modelYear: '2026', scheduledDate: '2026-10-22',
    order: i + 1, price: 85000 + i, phone: '0500000000', status: i === 0 ? 'published' : 'scheduled',
  }));
  const copy = structuredClone(original);
  const assigned = assignOpenSooqBranches(original);
  assert.deepEqual(original, copy, 'migration must not mutate saved master plan rows');
  assert.equal(assigned.filter((row) => row.branchId === 'showroom').length, 7);
  assert.equal(assigned.filter((row) => row.branchId === 'qadisiyah').length, 7);
  assert.deepEqual(assigned.map(({branchId, ...row}) => row), original);
  const rechecked = assignOpenSooqBranches(assigned);
  assert.deepEqual(rechecked, assigned, 'assignment is idempotent');
  const updated = mergeOpenSooqAssignments(assigned, [{ ...assigned[1], branchId: 'qadisiyah',
    planId: '2026-10_2026-10-17', monthKey: '2026-10', weekStart: '2026-10-17',
    price: 70000, status: 'published', publishedAt: '2026-10-22T00:00:00.000Z' }]);
  assert.equal(updated[1].price, 70000);
  assert.equal(updated[1].status, 'published');
  assert.equal(updated[0].status, 'published');
  assert.equal(updated[2].status, 'scheduled');
});
