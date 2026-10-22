import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWeaponSlots, scoreWeapon, recommendationsFromRows, parseCsv, normalize } from '../weapon-comparison.js';
const plug = (socketIndex, name, category) => ({ socketIndex, definition: { displayProperties: { name }, plug: { plugCategoryIdentifier: category } } });
const sockets = [
  plug(0, 'Heavy Burst', 'intrinsics'), plug(1, 'Fluted Barrel', 'barrels'),
  plug(2, 'Alloy Magazine', 'magazines'), plug(3, 'Perpetual Motion', 'frames'),
  plug(4, 'Wellspring', 'frames'), plug(8, 'Psychohack', 'origins'),
  plug(9, 'Kill Tracker', 'v400.plugs.weapons.masterworks.trackers'),
];
test('real Bungie frames plugs occupy Perk 1 and Perk 2 in socket order', () => {
  assert.deepEqual(getWeaponSlots([...sockets].reverse()), { barrel: 'Fluted Barrel', magazine: 'Alloy Magazine', perkOne: 'Perpetual Motion', perkTwo: 'Wellspring' });
});
test('missing perk 1 does not shift perk 2 into its column', () => {
  const slots = getWeaponSlots(sockets.filter(({ socketIndex }) => socketIndex !== 3));
  assert.equal(slots.perkOne, ''); assert.equal(slots.perkTwo, 'Wellspring');
});
test('intrinsic frame and origin trait cannot become gameplay perks', () => {
  assert.equal(getWeaponSlots([plug(0, 'Aggressive Frame', 'intrinsics'), plug(8, 'Origin', 'origins.traits')]).perkOne, '');
});
test('matches use their own spreadsheet column and normalize enhanced names', () => {
  const expected = { barrel: ['Fluted Barrel'], magazine: ['Alloy Magazine'], perkOne: ['Perpetual Motion', 'Tunnel Vision'], perkTwo: ['Wellspring'] };
  const slots = { ...getWeaponSlots(sockets), perkOne: '  Enhanced   Perpetual Motion  ' };
  assert.equal(scoreWeapon(slots, expected).value, 4);
  const swapped = scoreWeapon({ ...slots, perkOne: 'Wellspring', perkTwo: 'Perpetual Motion' }, expected);
  assert.equal(swapped.matches.perkOne, false); assert.equal(swapped.matches.perkTwo, false);
  assert.equal(normalize('Martyr’s Retribution'), normalize("Martyr's Retribution"));
});
test('CSV handles real multiline alternatives, escaped quotes and prefixed Aegis headers', () => {
  const csv = '"WEAPON Name","PERKS Barrel","Mag","Perk 1","Perk 2"\r\n"Example","Fluted Barrel","Alloy Magazine","Repulsor Brace\nImpromptu Ammunition","Rampage\nDestabilizing Rounds"\r\n';
  const recommendation = new Map(recommendationsFromRows(parseCsv(csv))).get('example');
  assert.deepEqual(recommendation.perkOne, ['Repulsor Brace', 'Impromptu Ammunition']);
  assert.deepEqual(recommendation.perkTwo, ['Rampage', 'Destabilizing Rounds']);
  assert.equal(scoreWeapon({ barrel: 'Fluted Barrel', magazine: 'Alloy Magazine', perkOne: 'Impromptu Ammunition', perkTwo: 'Rampage' }, recommendation).value, 4);
  assert.deepEqual(parseCsv('"Name","a"\n"A ""quoted"" weapon","b"')[1], ['A "quoted" weapon', 'b']);
});
test('changed/missing spreadsheet headers fail visibly instead of comparing empty columns', () => {
  assert.throws(() => recommendationsFromRows([['Name', 'Barrel', 'Mag', 'Perk 1']]), /missing required/);
});

test('Aegis letter grade comes from Tier column, independent of the perk-match score', () => {
  for (const rating of ['S', 'A', 'B', 'C', 'D', 'F']) {
    const recommendation = new Map(recommendationsFromRows([
      ['Name', 'Barrel', 'Mag', 'Perk 1', 'Perk 2', 'Tier'],
      ['Example', 'One', 'Two', 'Three', 'Four', rating],
    ])).get('example');
    assert.equal(recommendation.rating, rating);
    assert.equal(scoreWeapon({}, recommendation).value, 0);
  }
});
test('missing or invalid Aegis grades are not invented', () => {
  const rows = [['Name', 'Barrel', 'Mag', 'Perk 1', 'Perk 2'], ['Example', '', '', '', '']];
  assert.equal(new Map(recommendationsFromRows(rows)).get('example').rating, null);
});
