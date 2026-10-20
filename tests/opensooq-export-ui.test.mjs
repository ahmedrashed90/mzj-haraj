import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schedule = readFileSync(new URL('../src/components/OpenSooqSchedule.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/pages/OpenSooqPage.tsx', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../src/pages/OpenSooqManagerPage.tsx', import.meta.url), 'utf8');

test('both OpenSooq roles use the same XLSX download path and never CSV', () => {
  assert.match(schedule, /export function downloadOpenSooqXlsx/);
  assert.match(schedule, /buildOpenSooqXlsx\(data/);
  assert.match(schedule, /\.xlsx`/);
  assert.match(admin, /downloadOpenSooqXlsx\(shownRows/);
  assert.match(manager, /downloadOpenSooqXlsx\(week.rows/);
  assert.doesNotMatch(admin + manager + schedule, /downloadOpenSooqCsv|\.csv`/);
});
