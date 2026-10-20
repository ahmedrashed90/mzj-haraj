import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('manager routes are separated from the admin AppDataProvider and Haraj pages', () => {
  const app = read('src/App.tsx');
  const manager = app.slice(app.indexOf('if (role === "branch_manager")'), app.indexOf('return <AppDataProvider>'));
  assert.match(manager, /OpenSooqManagerPage/);
  assert.doesNotMatch(manager, /AppDataProvider|AccountsPage|AdsPage|SchedulePage|InventoryPage/);
  assert.match(manager, /Navigate to="\/opensooq"/);
});

test('branch manager Firestore rules are scoped to one branch and cannot modify quota or Haraj', () => {
  const rules = read('firestore.rules');
  const scoped = rules.slice(rules.indexOf('match /opensooq_branch_assignments/'), rules.indexOf('match /{document=**}'));
  assert.match(scoped, /isOpenSooqManagerFor\(branchId\)/);
  assert.match(scoped, /hasOnly\(\['price', 'status', 'publishedAt', 'updatedAt'\]\)/);
  assert.match(scoped, /allow create, delete: if isAdmin\(\)/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.doesNotMatch(scoped, /reservedCount|monthlyLimit|haraj_ads/);
});

test('Vercel direct OpenSooq route and Firebase rules deployment config are included', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const firebase = JSON.parse(read('firebase.json'));
  assert.ok(vercel.rewrites.some((entry) => entry.source === '/opensooq' && entry.destination === '/index.html'));
  assert.equal(firebase.firestore.rules, 'firestore.rules');
});
