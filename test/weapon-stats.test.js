import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyWeaponStatBonuses, isEnhancedWeaponPlug, isGameplayTrait, isMasterworkPlug, scaleStat } from '../weapon-stats.js';
const investment = (statTypeHash, value, isConditionallyActive = false) => ({ statTypeHash, value, isConditionallyActive });
const definition = { itemType: 3, investmentStats: [investment(1, 20), investment(2, 40)] };
const linear = (statHash) => ({ statHash, maximumValue: 100, displayInterpolation: [{ value: 0, weight: 0 }, { value: 100, weight: 100 }] });
const group = { maximumValue: 100, scaledStats: [linear(1), linear(2)] };
const masterwork = { plug: { plugCategoryIdentifier: 'v400.plugs.weapons.masterworks.stat.handling', uiPlugLabel: 'masterwork' }, investmentStats: [investment(1, 10), investment(1, 0, true), investment(2, 0, true)] };
test('Tier 5 masterwork separates +10 mastery from +5 tier without double-counting the primary stat', () => {
  const stats = applyWeaponStatBonuses([{ hash: '1', value: 30 }, { hash: '2', value: 40 }], definition, [masterwork], { masterworked: true, gearTier: 5 }, group);
  assert.deepEqual(stats.map(({ value, baseValue, masterworkBonus, tierBonus }) => [value, baseValue, masterworkBonus, tierBonus]), [[35, 20, 10, 5], [45, 40, 0, 5]]);
});
test('tier stats are not added before full masterwork', () => {
  const partial = { plug: { plugCategoryIdentifier: 'v400.plugs.weapons.masterworks.stat.handling' }, investmentStats: [investment(1, 1)] };
  const [stat] = applyWeaponStatBonuses([{ hash: '1', value: 21 }], definition, [partial], { masterworked: false, gearTier: 5 }, group);
  assert.equal(stat.masterworkBonus, 1); assert.equal(stat.tierBonus, 0); assert.equal(stat.value, 21);
});
test('masterwork bonus uses interpolated display units, not raw investment points', () => {
  const weapon = { itemType: 3, investmentStats: [investment(1, 48)] };
  const barrel = { investmentStats: [investment(1, 10)] };
  const mw = { plug: { plugCategoryIdentifier: 'v400.plugs.weapons.masterworks.stat.reload' }, investmentStats: [investment(1, 10)] };
  const scaling = { scaledStats: [{ statHash: 1, maximumValue: 100, displayInterpolation: [{ value: 0, weight: 10 }, { value: 100, weight: 100 }] }] };
  const [stat] = applyWeaponStatBonuses([{ hash: '1', value: 71 }], weapon, [barrel, mw], { masterworked: true }, scaling);
  assert.equal(stat.baseValue, 62); assert.equal(stat.masterworkBonus, 9);
});
test('gold portions cap at 100 and unknown conditional totals are not guessed', () => {
  const weapon = { itemType: 3, investmentStats: [investment(1, 96)] };
  const [capped] = applyWeaponStatBonuses([{ hash: '1', value: 100 }], weapon, [masterwork], { masterworked: true, gearTier: 5 }, group);
  assert.equal(capped.masterworkBonus, 4); assert.equal(capped.tierBonus, 0);
  const original = { hash: '1', value: 88 };
  assert.equal(applyWeaponStatBonuses([original], definition, [masterwork], { masterworked: true, gearTier: 5 }, group)[0], original);
});
test('archetype intrinsic cannot be labeled an enhanced trait or masterwork plug', () => {
  const archetype = { itemTypeDisplayName: 'Enhanced Intrinsic', displayProperties: { name: 'Enhanced Precision Frame' }, plug: { plugCategoryIdentifier: 'intrinsics' } };
  assert.equal(isGameplayTrait(archetype), false); assert.equal(isMasterworkPlug(archetype), false);
  assert.equal(isGameplayTrait({ ...archetype, plug: { plugCategoryIdentifier: 'frames' } }), false);
  assert.equal(isGameplayTrait({ itemTypeDisplayName: 'Enhanced Trait', plug: { plugCategoryIdentifier: 'frames' } }), true);
});
test('stat scaling supports decreases such as charge time', () => {
  assert.equal(scaleStat(60, { displayInterpolation: [{ value: 0, weight: 1000 }, { value: 100, weight: 500 }] }), 700);
});

test('enhanced barrels, magazines, and origin traits use their own metadata', () => {
  for (const [category, type, name] of [
    ['tubes', 'Enhanced Launcher Barrel', 'Volatile Launch'],
    ['barrels', 'Enhanced Barrel', 'Fluted Barrel'],
    ['magazines', 'Enhanced Magazine', 'Appended Mag'],
    ['magazines_gl', 'Enhanced Magazine', 'High-Explosive Ordnance'],
    ['origins', 'Enhanced Origin Trait', 'Accelerated Assault'],
    ['frames', 'Enhanced Trait', 'Wellspring'],
  ]) {
    const plug = { plug: { plugCategoryIdentifier: category }, itemTypeDisplayName: type, displayProperties: { name } };
    assert.equal(isEnhancedWeaponPlug(plug), true, type);
    assert.equal(isEnhancedWeaponPlug({ ...plug, itemTypeDisplayName: type.replace('Enhanced ', '') }), false, 'normal ' + type);
  }
});
test('archetypes and masterwork plugs cannot acquire enhanced perk markers', () => {
  for (const category of ['intrinsics', 'v400.plugs.weapons.masterworks.stat.range']) {
    assert.equal(isEnhancedWeaponPlug({ plug: { plugCategoryIdentifier: category }, itemTypeDisplayName: 'Enhanced Intrinsic', displayProperties: { name: 'Enhanced Adaptive Frame' } }), false);
  }
});
