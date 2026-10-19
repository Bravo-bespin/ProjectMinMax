import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTransfer, executeTransfer } from '../transfers.js';
const item = { itemInstanceId: 'item-1', itemHash: 123, transferStatus: 0 };
const characters = ['titan', 'hunter'];
test('character to vault and vault to character use the correct direction and character', () => {
  assert.deepEqual(planTransfer(item, 'titan', 'vault', characters, 3), [{ itemReferenceHash: 123, itemId: 'item-1', stackSize: 1, membershipType: 3, characterId: 'titan', transferToVault: true }]);
  assert.deepEqual(planTransfer(item, 'vault', 'hunter', characters, 3).map((step) => [step.characterId, step.transferToVault]), [['hunter', false]]);
});
test('character to character routes through vault in order', async () => {
  const steps = planTransfer(item, 'titan', 'hunter', characters, 3);
  const sent = [];
  await executeTransfer(steps, async (step) => sent.push(step));
  assert.deepEqual(sent.map((step) => [step.characterId, step.transferToVault]), [['titan', true], ['hunter', false]]);
});
test('equipped, blocked, invalid and non-instanced items cannot transfer', () => {
  for (const invalid of [{ ...item, equipped: true }, { ...item, transferStatus: 1 }, { itemHash: 123 }]) {
    assert.throws(() => planTransfer(invalid, 'titan', 'vault', characters, 3));
  }
  assert.throws(() => planTransfer(item, 'titan', 'unknown', characters, 3));
  assert.throws(() => planTransfer(item, 'titan', 'titan', characters, 3));
});
test('first-step failure stops without attempting the second transfer', async () => {
  let sent = 0;
  await assert.rejects(executeTransfer(planTransfer(item, 'titan', 'hunter', characters, 3), async () => { sent++; throw Error('Vault full'); }), /Vault full/);
  assert.equal(sent, 1);
});
test('second-step failure reports the item remains in the vault', async () => {
  let sent = 0;
  await assert.rejects(executeTransfer(planTransfer(item, 'titan', 'hunter', characters, 3), async () => { if (++sent === 2) throw Error('Character full'); }), /reached the vault.*Character full/);
});
