export const COMPARISON_FIELDS = ['barrel', 'magazine', 'perkOne', 'perkTwo'];

export function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/^enhanced\s+/i, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += character;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function recommendationOptions(value) {
  return String(value ?? '').split(/\r?\n|\\n/).map((option) => option.trim()).filter(Boolean);
}

export function recommendationsFromRows(rows) {
  const [headers = [], ...weapons] = rows;
  const index = (name) => headers.findIndex((header) => {
    const value = normalize(header);
    return value === name || value.endsWith(' ' + name);
  });
  const columns = { name: index('name'), barrel: index('barrel'), magazine: index('mag'), perkOne: index('perk 1'), perkTwo: index('perk 2') };
  if (Object.values(columns).some((column) => column < 0)) throw new Error('Aegis sheet is missing required weapon/perk columns.');
  const ratingIndex = index('tier');
  return weapons.flatMap((weapon) => {
    const name = normalize(weapon[columns.name]);
    if (!name) return [];
    const rating = String(weapon[ratingIndex] ?? '').trim().toUpperCase();
    return [[name, { ...Object.fromEntries(COMPARISON_FIELDS.map((field) => [field, recommendationOptions(weapon[columns[field]])])),
      rating: /^[SABCDF][+-]?$/.test(rating) ? rating : null,
    }]];
  });
}

export function getWeaponSlots(socketPlugs) {
  const slots = { barrel: '', magazine: '', perkOne: '', perkTwo: '' };
  const traits = [];
  for (const { socketIndex, definition } of [...socketPlugs].sort((a, b) => a.socketIndex - b.socketIndex)) {
    const category = definition.plug?.plugCategoryIdentifier?.toLowerCase() ?? '';
    const name = definition.displayProperties?.name;
    if (!name) continue;
    if (/barrel|scope|bowstring|blade|tubes/.test(category) && !slots.barrel) slots.barrel = name;
    if (/magazine|arrow|guard/.test(category) && !slots.magazine) slots.magazine = name;
    // Bungie's normal/enhanced gameplay traits use "frames". Intrinsics and
    // origin traits are separate categories and must never consume a perk slot.
    if ((category === 'frames' || /(^|\.)traits?$/.test(category)) && !/origin|intrinsic/.test(category)) {
      traits.push({ socketIndex, name });
    }
  }
  // Normal weapon sockets 3 and 4 are the two gameplay columns. Preserve holes
  // instead of relabeling perk 2 as perk 1 when a socket is empty or disabled.
  if (traits.some(({ socketIndex }) => socketIndex === 3 || socketIndex === 4)) {
    slots.perkOne = traits.find(({ socketIndex }) => socketIndex === 3)?.name ?? '';
    slots.perkTwo = traits.find(({ socketIndex }) => socketIndex === 4)?.name ?? '';
  } else {
    [slots.perkOne = '', slots.perkTwo = ''] = traits.map(({ name }) => name);
  }
  return slots;
}

export function scoreWeapon(slots, recommendation) {
  if (!recommendation) return null;
  const matches = Object.fromEntries(COMPARISON_FIELDS.map((field) => [field,
    Boolean(slots[field]) && (recommendation[field] ?? []).some((option) => normalize(option) === normalize(slots[field])),
  ]));
  return { matches, value: Object.values(matches).filter(Boolean).length, total: COMPARISON_FIELDS.length };
}
