import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGearDetails } from '../gear-details.js';
test('hover details use instance stats, active perks, and selected plug tracker including zero', async () => {
  const definitions = {
    'DestinyInventoryItemDefinition:10': { plug: { plugCategoryIdentifier: 'intrinsics' }, displayProperties: { name: 'Aggressive Burst', icon: '/frame.png' } },
    'DestinyInventoryItemDefinition:11': { plug: { plugCategoryIdentifier: 'traits' }, displayProperties: { name: 'Wellspring' } },
    'DestinyStatDefinition:20': { displayProperties: { name: 'Range' } },
    'DestinyStatDefinition:21': { displayProperties: { name: 'Magazine' } },
    'DestinyStatDefinition:22': { displayProperties: { name: 'Impact' } },
    'DestinyObjectiveDefinition:30': { progressDescription: 'Enemies Defeated' },
  };
  const result = await getGearDetails({ itemInstanceId: 'x', state: 1 }, { equippingBlock: { ammoType: 1 }, inventory: { tierType: 5 } }, {
    sockets: { data: { x: { sockets: [{ plugHash: 10, isEnabled: true }, { plugHash: 11 }, { plugHash: 99, isEnabled: false }] } } },
    stats: { data: { x: { stats: { 20: { value: 67 }, 21: { value: 24 }, 22: { value: 56 } } } } },
    plugObjectives: { data: { x: { objectivesPerPlug: { 10: [{ objectiveHash: 30, progress: 0 }], 99: [{ objectiveHash: 999, progress: 50 }] } } } },
    instances: { data: { x: { damageType: 1 } } },
  }, async (type, hash) => {
    const definition = definitions[`${type}:${hash}`];
    assert.ok(definition, `unexpected definition ${type}:${hash}`);
    return definition;
  });
  assert.deepEqual(result.stats.map((stat) => [stat.name, stat.value, stat.numeric]), [['Impact', 56, false], ['Range', 67, false], ['Magazine', 24, true]]);
  assert.deepEqual(result.perks.map((perk) => perk.name), ['Aggressive Burst', 'Wellspring']);
  assert.deepEqual(result.tracker, { label: 'Enemies Defeated', value: 0 });
  assert.equal(result.ammo, 'Primary'); assert.equal(result.damage, 'Kinetic'); assert.equal(result.locked, true);
});
test('missing stats and trackers remain absent instead of fabricated', async () => {
  const result = await getGearDetails({ itemInstanceId: 'x' }, {}, {}, async () => assert.fail('No definitions needed'));
  assert.deepEqual(result.stats, []); assert.deepEqual(result.perks, []); assert.equal(result.tracker, null);
});
