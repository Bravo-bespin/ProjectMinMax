import { app, BrowserWindow, ipcMain } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const icon = (color, letter) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/><path d="M5 5H59V59H5Z" fill="none" stroke="#ffffff88"/><text x="32" y="42" text-anchor="middle" fill="white" font-family="Arial" font-size="28">${letter}</text></svg>`);
const slots = [[1498876634, 'Empirical Evidence', 3], [2465295065, 'Energy weapon', 3], [953998645, 'Power weapon', 3], [3448274439, 'Helmet', 2], [3551918588, 'Gauntlets', 2], [14239492, 'Chest piece', 2], [20886954, 'Boots', 2], [1585787867, 'Class item', 2]];
const gear = slots.map(([bucket, name, type], index) => ({ id: String(index), bucket, name, type, source: 'titan', equipped: true, transferable: false, icon: icon('#59446b', name[0]), tier: 'Legendary', tierType: 5, power: 1432, slots: {}, stats: [], perks: [] }));
const spare = { ...gear[0], id: 'spare', name: 'Spare sidearm', equipped: false, transferable: true };
const vaulted = { ...spare, id: 'vault-item', name: 'Vault sidearm', source: 'vault' };
let inventory = { characters: [{ id: 'titan', className: 'Titan', light: 1432, gear: [...gear, spare] }, { id: 'hunter', className: 'Hunter', light: 1420, gear: [] }], vault: [vaulted] };
const details = {
  stats: [['Impact', 56], ['Range', 67], ['Stability', 40], ['Handling', 32], ['Reload Speed', 32], ['Rounds Per Minute', 325], ['Magazine', 24]].map(([name, value]) => ({ name, value, numeric: ['Rounds Per Minute', 'Magazine'].includes(name) })),
  perks: ['Aggressive Burst', 'Tunnel Vision', 'Wellspring', 'Psychohack'].map((name, index) => ({ name, intrinsic: index === 0, icon: icon('#00000000', '◇') })),
  ammo: 'Primary', damage: 'Kinetic', tracker: { label: 'Enemies Defeated', value: 0 }, locked: true, tierType: 5, slots: {}, detailsLoaded: true,
};
let window;
let transfers = [];
ipcMain.handle('overlay:status', () => ({ keyboardReady: true, message: 'Clear overlay hides everything. Press M twice within 350 ms to restore.' }));
ipcMain.handle('inventory:details', () => details);
ipcMain.handle('inventory:transfer', (_event, request) => {
  transfers.push(request);
  assert.equal(request.source, 'vault'); assert.equal(request.destination, 'hunter');
  inventory = { ...inventory, vault: [], characters: inventory.characters.map((character) => character.id === 'hunter' ? { ...character, gear: [{ ...vaulted, source: 'hunter' }] } : character) };
  window.webContents.send('inventory:update', inventory);
  return { ok: true, message: 'Item transferred.' };
});
app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({ width: 1180, height: 1000, show: false, webPreferences: { preload: fileURLToPath(new URL('../preload.cjs', import.meta.url)), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    let page = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8')
      .replace('__PROFILE_DATA__', () => JSON.stringify(inventory).replaceAll('<', '\\u003c')).replace('__REFRESH_TIME__', 'Fixture preview')
      .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${readFileSync(new URL('../renderer/styles.css', import.meta.url), 'utf8')}</style>`)
      .replace('<script src="./app.js"></script>', () => `<script>${readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')}</script>`);
    const js = (code) => window.webContents.executeJavaScript(code);
    const waitFor = (condition) => js(`new Promise((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => { if (${condition}) { clearInterval(timer); resolve(true); } else if (Date.now() - started > 3000) { clearInterval(timer); reject(Error('UI timeout')); } }, 20); })`);
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
    assert.deepEqual(await js(`Array.from(document.querySelectorAll('.weapon-column .equipment-slot')).map(node => node.dataset.slot)`), ['Kinetic', 'Energy', 'Power']);
    assert.deepEqual(await js(`Array.from(document.querySelectorAll('.armor-column .equipment-slot')).map(node => node.dataset.slot)`), ['Helmet', 'Gauntlets', 'Chest', 'Boots', 'Class item']);
    assert.equal(await js(`document.querySelector('.equipped .move-item').disabled`), true);
    await js(`document.querySelector('[data-item-id="0"]').dispatchEvent(new MouseEvent('mouseenter'))`);
    await waitFor(`document.querySelector('.preview.open .item-stat')`);
    assert.equal(await js(`document.querySelector('.preview.open .item-power').textContent`), '1432');
    assert.equal(await js(`document.querySelector('.preview.open .item-tracker').textContent`), 'Enemies Defeated0');
    writeFileSync('/tmp/minmax-item-preview.png', (await window.webContents.capturePage()).toPNG());
    window.setSize(560, 500);
    await js(`document.querySelector('[data-item-id="0"]').dispatchEvent(new MouseEvent('mouseenter'))`);
    assert.equal(await js(`(() => { const r = document.querySelector('.preview.open').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`), true);
    window.setSize(1180, 1000);
    await js(`Array.from(document.querySelectorAll('.character')).find(button => button.textContent.includes('Vault')).click()`);
    assert.equal(await js(`document.querySelectorAll('.vault-grid .gear-item').length`), 1);
    await js(`document.querySelector('.vault-grid .move-item').click(); document.querySelector('#transfer-destination').value = 'hunter'; document.querySelector('#transfer-submit').click()`);
    await waitFor(`!document.querySelector('#transfer-dialog').open`);
    assert.equal(transfers.length, 1);
    assert.equal(await js(`document.querySelector('#inventory-message').textContent`), 'Item transferred.');
    await js(`Array.from(document.querySelectorAll('.character')).find(button => button.textContent.includes('Hunter')).click()`);
    assert.equal(await js(`document.querySelectorAll('[data-item-id="vault-item"]').length`), 1);
    console.log('Inventory UI passed: slot order, live hover details, edge positioning, equipped restriction, vault and mocked transfer.');
    console.log('Preview saved to /tmp/minmax-item-preview.png');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
