import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInventoryStages } from '../inventory-loader.js';
test('character screen publishes before any vault request starts', async () => {
  const events = [];
  const result = await loadInventoryStages([{ id: 1, source: 'vault' }, { id: 2, source: 'guardian' }],
    async (item, background) => { events.push(['hydrate', item.id, background]); return item; },
    async (gear, count) => { events.push(['publish', gear.map((item) => item.id), count]); });
  assert.deepEqual(events, [['hydrate', 2, false], ['publish', [2], 1], ['hydrate', 1, true]]);
  assert.equal(result.characterGear.length, 1); assert.equal(result.vaultGear.length, 1);
});
test('a failed vault request cannot prevent the character screen publishing', async () => {
  let published = false;
  await assert.rejects(loadInventoryStages([{ source: 'vault' }], async () => { throw Error('Vault network failure'); }, async () => { published = true; }), /Vault network failure/);
  assert.equal(published, true);
});

test('equipped gear appears before carried gear and the vault on a cold launch', async () => {
  const events = [];
  await loadInventoryStages([
    { id: 'vault', source: 'vault' }, { id: 'reserve', source: 'guardian' },
    { id: 'equipped', source: 'guardian', equipped: true },
  ], async (item) => { events.push('fetch:' + item.id); return item; },
  async (gear) => { events.push('show:' + gear.map((item) => item.id).join(',')); });
  assert.deepEqual(events, ['fetch:equipped', 'show:equipped', 'fetch:reserve', 'show:equipped,reserve', 'fetch:vault']);
});
