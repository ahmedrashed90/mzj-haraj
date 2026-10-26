import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('OpenSooq cars come only from the new server-side NEXT ERP endpoint; Haraj source remains unchanged', () => {
  const page = read('src/pages/OpenSooqPage.tsx');
  const data = read('src/data.ts');
  const harajStock = read('api/stock.ts');
  const erp = read('api/opensooq-erp-stock.ts');
  const erpReader = read('server/opensooq-erp-stock.ts');
  assert.match(page, /fetchOpenSooqErpStock\(/);
  assert.doesNotMatch(page, /const \{ stock, stockTotalVehicles, stockLoading, stockError, refreshStock,/);
  assert.match(data, /fetchStock\(\).*"\/api\/stock"/);
  assert.match(data, /fetchOpenSooqErpStock\(\).*"\/api\/opensooq-erp-stock"/);
  assert.match(harajStock, /resource", "vehicles"/);
  assert.match(erp, /readNextErpStock/);
  assert.match(erp, /from [\'"]\.\.\/server\/opensooq-erp-stock\.js[\'"]/);
  assert.doesNotMatch(erp, /from [\'"]\.\.\/server\/opensooq-erp-stock[\'"]/);
  assert.match(erpReader, /"Serial No"/);
  assert.match(erpReader, /"Item"/);
  assert.match(erpReader, /"متاحة للحجز"/);
  assert.match(erpReader, /frappe\.client\.get_list/);
  assert.match(erpReader, /payload\.message/);
  assert.doesNotMatch(erpReader, /api\/resource/);
  assert.match(erp, /NEXT_ERP_URL/);
  assert.doesNotMatch(erp, /\/api\/operations|MZJ_PLATFORM_IDENTIFIER/);
});

test('saved schedule replacement is explicit and does not change monthly reserved quota', () => {
  const page = read('src/pages/OpenSooqPage.tsx');
  const data = read('src/opensooq-data.ts');
  assert.match(page, /تحديث غير المنشور من NEXT ERP/);
  assert.match(page, /window\.confirm\(/);
  const start = data.indexOf('export async function replaceOpenSooqUnpublishedPlan(');
  const end = data.indexOf('export async function removeOpenSooqDuplicateUnpublishedRows(', start);
  assert.ok(start >= 0 && end > start);
  const functionBody = data.slice(start, end);
  assert.match(functionBody, /transaction\.update\(monthDoc, \{ usedUnitKeys:/);
  assert.doesNotMatch(functionBody, /reservedCount\s*:/);
  assert.match(functionBody, /row\.status === "published"/);
});
