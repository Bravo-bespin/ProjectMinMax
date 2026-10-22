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

test('armor upgrade masterwork is omitted from both perk and masterwork rows', async () => {
  const result = await getGearDetails({ itemInstanceId: 'armor', state: 4 }, { itemType: 2 }, {
    sockets: { data: { armor: { sockets: [{ plugHash: 1 }, { plugHash: 2 }] } } },
  }, async (_type, hash) => ({
    plug: { plugCategoryIdentifier: hash === 1 ? 'masterworks.stat.armor' : 'armor.mods' },
    displayProperties: { name: 'Upgrade Armor' },
  }));
  assert.equal(result.masterwork, null);
  assert.deepEqual(result.perks, []);
  assert.equal(result.masterworked, true);
});

test('legacy armor omits unnamed internal plugs while keeping installed armor mods', async () => {
  const result = await getGearDetails({ itemInstanceId: 'armor' }, { itemType: 2 }, {
    sockets: { data: { armor: { sockets: [1, 2, 3, 4, 5].map((plugHash) => ({ plugHash })) } } },
  }, async (_type, hash) => ({
    plug: { plugCategoryIdentifier: 'armor.mods' },
    displayProperties: hash === 5 ? { name: 'Resilience Mod', icon: '/mod.png' }
      : { name: [undefined, '', ' ', '\t'][hash - 1] },
  }));
  assert.equal(result.gearTier, null);
  assert.deepEqual(result.perks.map((perk) => perk.name), ['Resilience Mod']);
  assert.equal(result.socketPlugs.length, 5);
});

test('gear tier, masterwork and enhancement are separate instance states', async () => {
  const { getGearState } = await import('../gear-details.js');
  assert.deepEqual(getGearState({ state: 4 | 8 | 32 }, { gearTier: 5 }, { inventory: { recipeItemHash: 123 } }), { gearTier: 5, masterworked: true, crafted: true, enhanced: true });
  assert.deepEqual(getGearState({ state: 1 }, {}), { gearTier: null, masterworked: false, crafted: false, enhanced: false });
  for (const gearTier of [0, 6, undefined]) assert.equal(getGearState({}, { gearTier }).gearTier, null);
});
test('enhanced random rolls with the crafted flag are not labeled crafted', async () => {
  const { getGearState } = await import('../gear-details.js');
  for (const state of [8, 8 | 4, 8 | 32]) {
    const result = getGearState({ state }, {}, { inventory: {} });
    assert.equal(result.crafted, false);
    assert.equal(result.enhanced, true);
  }
  const craftableDrop = getGearState({ state: 0 }, {}, { inventory: { recipeItemHash: 123 } });
  assert.equal(craftableDrop.crafted, false);
  assert.equal(craftableDrop.enhanced, false);
  const shaped = getGearState({ state: 8 }, {}, { inventory: { recipeItemHash: 123 } });
  assert.equal(shaped.crafted, true);
  assert.equal(shaped.enhanced, false);
});
test('active enhanced gameplay traits keep physical socket indices and show their enhanced metadata', async () => {
  const result = await getGearDetails({ itemInstanceId: 'x', state: 4 }, {}, {
    instances: { data: { x: { gearTier: 4 } } },
    sockets: { data: { x: { sockets: [ {}, {}, {}, { plugHash: 10, isEnabled: false }, { plugHash: 11 } ] } } },
  }, async () => ({ plug: { plugCategoryIdentifier: 'frames' }, itemTypeDisplayName: 'Enhanced Trait', displayProperties: { name: 'Jolting Feedback', icon: '/perk.png' } }));
  assert.equal(result.socketPlugs[0].socketIndex, 4);
  assert.equal(result.perks[0].enhanced, true);
  assert.equal(result.perks[0].name, 'Jolting Feedback');
  assert.equal(result.gearTier, 4); assert.equal(result.masterworked, true);
});

test('enhanced archetype frame stays neutral and is not rendered as a masterwork entry', async () => {
  const result = await getGearDetails({ itemInstanceId: 'x', state: 0 }, {}, {
    sockets: { data: { x: { sockets: [{ plugHash: 10 }] } } },
  }, async () => ({ plug: { plugCategoryIdentifier: 'intrinsics' }, itemTypeDisplayName: 'Enhanced Intrinsic', displayProperties: { name: 'Enhanced Adaptive Frame' } }));
  assert.equal(result.perks[0].intrinsic, true);
  assert.equal(result.perks[0].enhanced, false);
  assert.equal(result.masterwork, null);
  assert.equal(result.masterworked, false);
});

test('hover includes enhanced barrels, magazines and origin traits without marking a normal frame', async () => {
  const plugs = [
    ['intrinsics', 'Intrinsic', 'Micro-Missile Frame'],
    ['tubes', 'Enhanced Launcher Barrel', 'Volatile Launch'],
    ['magazines', 'Enhanced Magazine', 'Appended Mag'],
    ['origins', 'Enhanced Origin Trait', 'Accelerated Assault'],
  ];
  const result = await getGearDetails({ itemInstanceId: 'x', state: 32 }, {}, {
    sockets: { data: { x: { sockets: plugs.map((_plug, index) => ({ plugHash: index + 1 })) } } },
  }, async (_type, hash) => {
    const [category, type, name] = plugs[hash - 1];
    return { plug: { plugCategoryIdentifier: category }, itemTypeDisplayName: type, displayProperties: { name } };
  });
  assert.deepEqual(result.perks.map(({ name, enhanced }) => [name, enhanced]), [
    ['Micro-Missile Frame', false], ['Volatile Launch', true], ['Appended Mag', true], ['Accelerated Assault', true],
  ]);
});
