const initialInventory = JSON.parse(document.querySelector("#profile-data").textContent);
let inventory = Array.isArray(initialInventory) ? { characters: initialInventory, vault: [] } : initialInventory;
let characters = inventory.characters;
let selectedLocation = characters[0]?.id || "vault";
let vaultSearch = "";
let vaultType = "all";
const labels = { barrel: 'Barrel', magazine: 'Magazine', perkOne: 'Perk 1', perkTwo: 'Perk 2' };
const characterList = document.querySelector('#characters'); const details = document.querySelector('#details');
function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function previewFor(item) {
  const preview = element('aside', 'preview');
  preview.setAttribute('role', 'tooltip');
  preview.dataset.tier = item.tierType ?? 5;
  const heading = element('div', 'item-heading');
  heading.append(element('h3', '', item.name));
  const subtitle = element('div', 'item-subtitle');
  subtitle.append(element('span', '', item.category), element('span', '', item.tier + (item.locked ? ' ▣' : '')));
  heading.append(subtitle);
  preview.append(heading);

  const summary = element('div', 'item-summary');
  const powerLine = element('div', 'item-power-line');
  if (item.power !== null) powerLine.append(element('span', 'item-power', item.power));
  if (item.damage) powerLine.append(element('span', 'damage damage-' + item.damage.toLowerCase(), item.damage));
  if (item.ammo) powerLine.append(element('span', 'ammo', item.ammo));
  summary.append(powerLine);
  if (item.tracker) {
    const tracker = element('div', 'item-tracker');
    tracker.append(element('span', '', item.tracker.label), element('span', '', item.tracker.value.toLocaleString()));
    summary.append(tracker);
  }
  preview.append(summary);

  const stats = element('div', 'item-stats');
  for (const stat of item.stats ?? []) {
    const row = element('div', 'item-stat' + (stat.numeric ? ' numeric' : ''));
    row.append(element('span', 'stat-name', stat.name));
    if (!stat.numeric) {
      const track = element('div', 'stat-track');
      const fill = element('div', 'stat-fill');
      fill.style.width = Math.max(0, Math.min(100, stat.value)) + '%';
      track.append(fill);
      row.append(track);
    }
    row.append(element('span', 'stat-value', stat.value));
    stats.append(row);
  }
  if (stats.childElementCount) preview.append(stats);

  const perks = element('div', 'item-perks');
  for (const perk of item.perks ?? []) {
    const row = element('div', 'item-perk' + (perk.intrinsic ? ' intrinsic' : ''));
    if (perk.icon) {
      const icon = element('img', 'perk-icon');
      icon.src = perk.icon;
      icon.alt = '';
      row.append(icon);
    } else row.append(element('span', 'perk-placeholder', '◇'));
    row.append(element('span', '', perk.name));
    row.title = perk.description;
    perks.append(row);
  }
  if (perks.childElementCount) preview.append(perks);

  const comparison = element('div', 'item-comparison');
  if (item.score) {
    comparison.append(element('div', 'score', 'Aegis match: ' + item.score.value + ' / ' + item.score.total));
    for (const [field, label] of Object.entries(labels)) {
      if (!item.slots[field]) continue;
      const line = element('div', 'slot');
      line.append(element('span', '', label), element('b', item.score.matches[field] ? 'match' : 'miss', item.slots[field]));
      comparison.append(line);
    }
  }
  if (item.excluded) comparison.append(element('p', 'hint', item.excluded));
  if (comparison.childElementCount) preview.append(comparison);
  if (!item.detailsLoaded) preview.append(element("p", "hint preview-loading", "Loading item details…"));
  return preview;
}

function attachPreview(card, item) {
  let preview = previewFor(item);
  preview.id = 'item-preview-' + item.id;
  card.tabIndex = 0;
  card.setAttribute('aria-describedby', preview.id);
  card.append(preview);
  let closeTimer;
  const hide = () => preview.classList.remove('open');
  const position = () => {
    const bounds = card.getBoundingClientRect();
    const width = preview.offsetWidth;
    let left = bounds.right + 12;
    if (left + width > innerWidth - 12) left = bounds.left - width - 12;
    preview.style.left = Math.max(12, Math.min(left, innerWidth - width - 12)) + 'px';
    preview.style.top = Math.max(12, Math.min(bounds.top, innerHeight - preview.offsetHeight - 12)) + 'px';
  };
  const bindPanel = () => {
    preview.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    preview.addEventListener('mouseleave', scheduleHide);
  };
  const show = async () => {
    clearTimeout(closeTimer);
    document.querySelectorAll('.preview.open').forEach((panel) => panel.classList.remove('open'));
    preview.classList.add('open');
    position();
    if (item.detailsLoaded || !window.minmaxInventory) return;
    if (!item.detailsPromise) item.detailsPromise = window.minmaxInventory.details(item.id).then((details) => {
      Object.assign(item, details, { detailsLoaded: true });
    }).finally(() => { item.detailsPromise = undefined; });
    try {
      await item.detailsPromise;
      if (!card.isConnected) return;
      const replacement = previewFor(item);
      replacement.id = preview.id;
      replacement.classList.toggle('open', preview.classList.contains('open'));
      preview.replaceWith(replacement);
      preview = replacement;
      bindPanel();
      if (preview.classList.contains('open')) position();
    } catch (error) {
      if (!preview.querySelector('.load-error')) preview.append(element('p', 'hint load-error', 'Details could not load: ' + error.message));
    }
  };
  const scheduleHide = () => { closeTimer = setTimeout(hide, 120); };
  card.addEventListener('mouseenter', show);
  card.addEventListener('mouseleave', scheduleHide);
  bindPanel();
  card.addEventListener('focus', show);
  card.addEventListener('blur', hide);
  card.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
}

const WEAPON_SLOTS = [
  [1498876634, 'Kinetic'], [2465295065, 'Energy'], [953998645, 'Power'],
];
const ARMOR_SLOTS = [
  [3448274439, 'Helmet'], [3551918588, 'Gauntlets'], [14239492, 'Chest'],
  [20886954, 'Boots'], [1585787867, 'Class item'],
];
function itemCard(item, compact = false) {
  const card = element('article', 'gear-item' + (compact ? ' compact' : '') + (item.equipped ? ' equipped' : ''));
  card.dataset.itemId = item.id;
  card.setAttribute('aria-label', item.name + (item.equipped ? ', equipped' : ''));
  if (item.icon) {
    const icon = element('img', 'gear-icon');
    icon.src = item.icon;
    icon.alt = '';
    card.append(icon);
  } else card.append(element('div', 'gear-placeholder', item.name.slice(0, 1)));
  const copy = element('div', 'gear-copy');
  copy.append(element('strong', '', item.name), element('small', '', item.power === null ? item.category : 'Power ' + item.power));
  card.append(copy);
  const move = element('button', 'move-item', '↗');
  move.type = 'button';
  move.disabled = !item.transferable;
  move.title = item.equipped ? 'Unequip in Destiny 2 to transfer' : !item.transferable ? 'This item cannot be transferred' : 'Transfer ' + item.name;
  move.setAttribute('aria-label', move.title);
  move.addEventListener('click', (event) => { event.stopPropagation(); openTransfer(item); });
  card.append(move);
  attachPreview(card, item);
  return card;
}

function slotColumn(character, slots, className) {
  const column = element('div', 'slot-column ' + className);
  for (const [bucket, label] of slots) {
    const group = element('section', 'equipment-slot');
    group.dataset.slot = label;
    group.append(element('h3', 'slot-label', label));
    const items = character.gear.filter((item) => item.bucket === bucket);
    const equipped = items.find((item) => item.equipped);
    group.append(equipped ? itemCard(equipped) : element('div', 'empty-slot', 'No equipped ' + label.toLowerCase()));
    const reserves = element('div', 'reserve-items');
    for (const item of items.filter((item) => !item.equipped)) reserves.append(itemCard(item, true));
    if (reserves.childElementCount) group.append(reserves);
    column.append(group);
  }
  return column;
}

function selectCharacter(character) {
  const layout = element('div', 'guardian-layout');
  const guardian = element('section', 'guardian-summary');
  if (character.emblem) guardian.style.backgroundImage = 'linear-gradient(#10131a88, #10131af5), url("' + character.emblem + '")';
  guardian.append(element('div', 'guardian-label', 'GUARDIAN'), element('h2', '', character.className),
    element('div', 'guardian-power-label', 'POWER'), element('div', 'guardian-power', character.light),
    element('div', 'guardian-sigil', character.className.slice(0, 1)),
    element('p', 'hint', 'Hover to inspect · ↗ to transfer'));
  layout.append(slotColumn(character, WEAPON_SLOTS, 'weapon-column'), guardian, slotColumn(character, ARMOR_SLOTS, 'armor-column'));
  details.append(layout);
}

function showVault() {
  const toolbar = element('div', 'vault-toolbar');
  toolbar.append(element('h2', '', 'Vault · ' + inventory.vault.length + ' items'));
  const search = element('input', 'vault-search');
  search.type = 'search'; search.placeholder = 'Search vault'; search.value = vaultSearch;
  search.setAttribute('aria-label', 'Search vault');
  const filter = element('select', 'vault-filter');
  filter.setAttribute('aria-label', 'Vault item type');
  for (const [value, label] of [['all', 'All gear'], ['3', 'Weapons'], ['2', 'Armor']]) {
    const option = element('option', '', label); option.value = value; filter.append(option);
  }
  filter.value = vaultType;
  toolbar.append(search, filter);
  const grid = element('div', 'gear vault-grid');
  const update = () => {
    vaultSearch = search.value; vaultType = filter.value;
    const items = inventory.vault.filter((item) => item.name.toLowerCase().includes(vaultSearch.toLowerCase()) && (vaultType === 'all' || item.type === Number(vaultType)));
    grid.replaceChildren(...items.map((item) => itemCard(item)));
    if (!items.length) grid.append(element('p', 'empty', 'No matching items in the vault.'));
  };
  search.addEventListener('input', update); filter.addEventListener('change', update);
  details.append(toolbar, grid); update();
}

function renderInventory(next = inventory) {
  inventory = next; characters = next.characters;
  if (next.refreshedAt) document.querySelector("#last-refreshed").textContent = "Last refreshed: " + new Date(next.refreshedAt).toLocaleTimeString();
  if (selectedLocation !== 'vault' && !characters.some((character) => character.id === selectedLocation)) selectedLocation = characters[0]?.id || 'vault';
  characterList.replaceChildren(); details.replaceChildren();
  for (const location of [...characters, { id: 'vault', className: 'Vault' }]) {
    const button = element('button', 'character' + (location.id === selectedLocation ? ' active' : ''));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(location.id === selectedLocation));
    button.append(element('h2', '', location.className));
    button.append(element('p', '', location.id === 'vault' ? inventory.vault.length + ' items' : 'Power ' + location.light));
    button.addEventListener('click', () => { selectedLocation = location.id; renderInventory(); });
    characterList.append(button);
  }
  if (selectedLocation === 'vault') showVault();
  else selectCharacter(characters.find((character) => character.id === selectedLocation));
}

const transferDialog = document.querySelector('#transfer-dialog');
const transferDestination = document.querySelector('#transfer-destination');
const transferSubmit = document.querySelector('#transfer-submit');
const transferMessage = document.querySelector('#transfer-message');
let transferItem;
let moving = false;
function openTransfer(item) {
  transferItem = item;
  document.querySelectorAll('.preview.open').forEach((panel) => panel.classList.remove('open'));
  document.querySelector('#transfer-name').textContent = item.name;
  transferMessage.textContent = '';
  transferDestination.replaceChildren();
  for (const destination of [{ id: 'vault', className: 'Vault' }, ...characters]) {
    if (destination.id === item.source) continue;
    const option = element('option', '', destination.className);
    option.value = destination.id; transferDestination.append(option);
  }
  transferDialog.showModal();
}
document.querySelector('#transfer-cancel').addEventListener('click', () => { if (!moving) transferDialog.close(); });
transferDialog.addEventListener('cancel', (event) => { if (moving) event.preventDefault(); });
transferSubmit.addEventListener('click', async () => {
  if (moving || !transferItem) return;
  moving = true; transferSubmit.disabled = true; transferDestination.disabled = true;
  document.querySelector('#transfer-cancel').disabled = true;
  transferMessage.textContent = 'Transferring…';
  try {
    const result = await window.minmaxInventory.transfer({ id: transferItem.id, source: transferItem.source, destination: transferDestination.value });
    transferMessage.textContent = result.message;
    document.querySelector('#inventory-message').textContent = result.message;
    if (result.ok) transferDialog.close();
  } catch (error) { transferMessage.textContent = error.message; }
  finally {
    moving = false; transferSubmit.disabled = false; transferDestination.disabled = false;
    document.querySelector('#transfer-cancel').disabled = false;
  }
});
renderInventory();
window.minmaxInventory?.onUpdate(renderInventory);

window.addEventListener('resize', () => document.querySelectorAll('.preview.open').forEach((panel) => panel.classList.remove('open')));
window.addEventListener('scroll', (event) => {
  if (event.target instanceof Element && event.target.closest('.preview')) return;
  document.querySelectorAll('.preview.open').forEach((panel) => panel.classList.remove('open'));
}, true);

const clearOverlay = document.querySelector('#clear-overlay');
const overlayStatus = document.querySelector('#overlay-status');
async function updateOverlayStatus(action) {
  clearOverlay.disabled = true;
  try {
    const state = await action();
    overlayStatus.textContent = state.message;
  } catch (error) {
    overlayStatus.textContent = 'Overlay unavailable: ' + error.message;
  } finally {
    clearOverlay.disabled = false;
  }
}
clearOverlay.addEventListener('click', () => updateOverlayStatus(() => window.minmaxOverlay.clear()));
document.querySelector('#close-app').addEventListener('click', () => window.minmaxOverlay.close());
updateOverlayStatus(() => window.minmaxOverlay.status());

window.minmaxOverlay.onVisibility((cleared) => {
  document.documentElement.classList.toggle('overlay-clear', cleared);
});
