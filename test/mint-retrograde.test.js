import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AEGIS_SHEETS, buildRecommendationIndex } from '../aegis-source.js';
import { getWeaponSlots, normalize, scoreWeapon } from '../weapon-comparison.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/mint-retrograde.json', import.meta.url)));

test('configured Aegis sources include Mint Retrograde’s Other tab', () => {
  assert.ok(AEGIS_SHEETS.includes(fixture.sheet));
  const index = buildRecommendationIndex([{ sheet: fixture.sheet, rows: [fixture.aegisHeaders, fixture.aegisRow] }]);
  const recommendation = index.get(normalize(fixture.weaponName));
  assert.equal(recommendation.sourceSheet, 'Other');
  assert.deepEqual(recommendation.perkOne, ['Field Prep', 'Beacon Rounds', 'Hatchling']);
  assert.deepEqual(recommendation.perkTwo, ['Master of Arms', 'Chain Reaction', 'Slice']);
});
test('Bungie-valid Mint Retrograde sample matches all four Aegis columns including tubes', () => {
  const index = buildRecommendationIndex([{ sheet: fixture.sheet, rows: [fixture.aegisHeaders, fixture.aegisRow] }]);
  const slots = getWeaponSlots(fixture.socketPlugs);
  assert.deepEqual(slots, { barrel: 'Volatile Launch', magazine: 'Appended Mag', perkOne: 'Beacon Rounds', perkTwo: 'Chain Reaction' });
  assert.deepEqual(scoreWeapon(slots, index.get(normalize(fixture.weaponName))), {
    matches: { barrel: true, magazine: true, perkOne: true, perkTwo: true }, value: 4, total: 4,
  });
});
