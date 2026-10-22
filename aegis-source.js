import { recommendationsFromRows } from './weapon-comparison.js';

export const AEGIS_SHEET_ID = '1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY';
export const AEGIS_SHEETS = [
  'Autos', 'Bows', 'HCs', 'Pulses', 'Scouts', 'Sidearms', 'SMGs', 'BGLs',
  'Fusions', 'Glaives', 'Shotguns', 'Snipers', 'Rocket Sidearms', 'Traces',
  'HGLs', 'LFRs', 'LMGs', 'Rockets', 'Swords', 'Other',
];

export function buildRecommendationIndex(tables) {
  return new Map(tables.flatMap(({ sheet, rows }) => recommendationsFromRows(rows)
    .map(([name, recommendation]) => [name, { ...recommendation, sourceSheet: sheet }])));
}
