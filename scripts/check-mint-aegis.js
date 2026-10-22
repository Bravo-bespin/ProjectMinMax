import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { AEGIS_SHEET_ID, AEGIS_SHEETS, buildRecommendationIndex } from '../aegis-source.js';
import { getWeaponSlots, normalize, parseCsv, scoreWeapon } from '../weapon-comparison.js';

try { loadEnvFile(new URL('../.env', import.meta.url)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!process.env.BUNGIE_API_KEY) throw new Error('BUNGIE_API_KEY is required for the public manifest check.');
const fixture = JSON.parse(await readFile(new URL('../test/fixtures/mint-retrograde.json', import.meta.url), 'utf8'));
assert.ok(AEGIS_SHEETS.includes(fixture.sheet), 'The app must load Aegis’s Other tab.');
const url = new URL(`https://docs.google.com/spreadsheets/d/${AEGIS_SHEET_ID}/gviz/tq`);
url.search = new URLSearchParams({ tqx: 'out:csv', sheet: fixture.sheet });
const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error('Could not load the live Aegis Other tab.');
const recommendation = buildRecommendationIndex([{ sheet: fixture.sheet, rows: parseCsv(await response.text()) }]).get(normalize(fixture.weaponName));
assert.ok(recommendation, 'Mint Retrograde must have a row on the live Other tab.');
async function definition(type, hash) {
  const response = await fetch(`https://www.bungie.net/Platform/Destiny2/Manifest/${type}/${hash}/`, {
    headers: { 'X-API-Key': process.env.BUNGIE_API_KEY }, signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok || body.ErrorCode !== 1) throw new Error(body.Message || 'Public definition request failed');
  return body.Response;
}
const weapon = await definition('DestinyInventoryItemDefinition', fixture.weaponHash);
const sockets = await Promise.all(fixture.socketPlugs.map(async (socket) => {
  const entry = weapon.sockets.socketEntries[socket.socketIndex];
  const pool = await definition('DestinyPlugSetDefinition', entry.randomizedPlugSetHash);
  assert.ok(pool.reusablePlugItems.some((plug) => plug.plugItemHash === socket.hash), `Plug ${socket.hash} must be allowed in socket ${socket.socketIndex}`);
  return { socketIndex: socket.socketIndex, definition: await definition('DestinyInventoryItemDefinition', socket.hash) };
}));
const slots = getWeaponSlots(sockets);
const score = scoreWeapon(slots, recommendation);
console.log('Weapon:', weapon.displayProperties.name, '(Bungie-valid sample roll; not an owned-instance check)');
console.log('Aegis sheet:', recommendation.sourceSheet);
console.log('Aegis rating:', recommendation.rating || 'Unrated');
for (const [field, perk] of Object.entries(slots)) console.log(`${field}: ${perk} — ${score.matches[field] ? 'MATCH' : 'NO MATCH'}`);
console.log(`Aegis score: ${score.value}/${score.total}`);
assert.equal(score.value, 4, 'This sample must match all four current Aegis columns.');
