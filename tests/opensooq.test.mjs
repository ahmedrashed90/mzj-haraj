import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenSooqSchedule, getOpenSooqPlanDays, getOpenSooqRemaining,
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
