import { app, BrowserWindow, ipcMain } from "electron";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createDefinitionStore } from "./definition-store.js";
import { loadInventoryStages } from "./inventory-loader.js";
import { normalize, parseCsv, getWeaponSlots, scoreWeapon } from "./weapon-comparison.js";
import { AEGIS_SHEET_ID, AEGIS_SHEETS, buildRecommendationIndex } from "./aegis-source.js";
import { profileWindowChrome } from "./window-chrome.js";
import { configureOverlay } from "./overlay.js";
import { getGearDetails, getGearState } from "./gear-details.js";
import { planTransfer, executeTransfer } from "./transfers.js";
import { getManifestDefinition, getMemberships, getProfile, transferItem } from "./api.js";

try {
  loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const rendererTemplate = readFileSync(new URL("./renderer/index.html", import.meta.url), "utf8");
const rendererStyles = readFileSync(new URL("./renderer/styles.css", import.meta.url), "utf8");
const rendererScript = readFileSync(new URL("./renderer/app.js", import.meta.url), "utf8");

const CLASS_NAMES = ["Titan", "Hunter", "Warlock"];

let profileWindowShown = false;
let quitting = false;
let aegisRecommendations;
let readyRecommendations;
let aegisRetryAt = 0;
let profileWindow;
let overlayState;
const definitions = createDefinitionStore({
  file: join(app.getPath("userData"), "manifest-definitions.json"),
  fetchDefinition: async (type, hash) => {
    const rich = type === 'DestinyInventoryItemStatsV1';
    const definition = await getManifestDefinition(rich ? 'DestinyInventoryItemDefinition' : type, hash);
    if (type === 'DestinyInventoryItemDefinition' || rich) return {
      displayProperties: definition.displayProperties, inventory: definition.inventory,
      equippingBlock: definition.equippingBlock, itemType: definition.itemType,
      itemTypeDisplayName: definition.itemTypeDisplayName,
      plug: definition.plug && { plugCategoryIdentifier: definition.plug.plugCategoryIdentifier, uiPlugLabel: definition.plug.uiPlugLabel },
      ...(rich ? { hash: definition.hash, investmentStats: definition.investmentStats, stats: { statGroupHash: definition.stats?.statGroupHash } } : {}),
    };
    if (type === 'DestinyStatGroupDefinition') return { scaledStats: definition.scaledStats, maximumValue: definition.maximumValue };
    return { displayProperties: definition.displayProperties, progressDescription: definition.progressDescription };
  },
});

function bungieImage(path) {
  return path ? `https://www.bungie.net${path}` : "";
}

async function fetchAegisRecommendations() {
  const results = await Promise.all(AEGIS_SHEETS.map(async (sheet) => {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${AEGIS_SHEET_ID}/gviz/tq`);
    url.search = new URLSearchParams({ tqx: "out:csv", sheet });
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Could not load Aegis recommendations for ${sheet}`);
    return { sheet, rows: parseCsv(await response.text()) };
  }));
  const recommendations = buildRecommendationIndex(results);
  return [...recommendations];
}

const recommendationStore = createDefinitionStore({
  file: join(app.getPath('userData'), 'aegis-recommendations.json'),
  maxAge: 6 * 60 * 60 * 1000,
  fetchDefinition: fetchAegisRecommendations,
});

function warmRecommendations() {
  if (!readyRecommendations && Date.now() >= aegisRetryAt) {
    void loadAegisRecommendations().catch((error) => console.error('Aegis comparison unavailable:', error.message));
  }
}

async function loadAegisRecommendations() {
  if (aegisRecommendations) return aegisRecommendations;
  aegisRecommendations = (async () => {
    const recommendations = new Map(await recommendationStore.get('Aegis-v4', `${AEGIS_SHEET_ID}:${AEGIS_SHEETS.join(',')}`));
    readyRecommendations = recommendations;
    // Resolve comparisons already viewed without fetching their stats again.
    for (const [id, cached] of detailsCache) {
      cached.then((details) => {
        if (detailsCache.get(id) !== cached || !details.aegisPending) return;
        const item = rawItems.get(id);
        if (!item) return;
        definitionFor('DestinyInventoryItemDefinition', item.itemHash).then((definition) => {
          const recommendation = recommendations.get(normalize(definition.displayProperties?.name));
          Object.assign(details, { recommendation, score: scoreWeapon(details.slots, recommendation), aegisPending: false,
            excluded: recommendation ? '' : 'This weapon has no matching Aegis recommendation row.' });
          if (!quitting && profileWindow && !profileWindow.isDestroyed() && !profileWindow.webContents.isDestroyed()) {
            profileWindow.webContents.send('inventory:item-details', { id, details });
          }
        }).catch(() => {});
      }).catch(() => {});
    }
    return recommendations;
  })().catch((error) => {
    aegisRetryAt = Date.now() + 60_000;
    aegisRecommendations = undefined;
    throw error;
  });

  return aegisRecommendations;
}

let currentProfile;
let currentMembership;
let transferBusy = false;
let rendererLoaded = false;
let displayedInventory;
const rawItems = new Map();
const detailsCache = new Map();
const definitionFor = (type, hash, options) => definitions.get(type, hash, options);

function indexItems(profile) {
  const indexed = new Map();
  const add = (items, source, equipped = false) => {
    for (const item of items ?? []) {
      if (item.itemInstanceId && item.bucketHash !== 215593132) indexed.set(item.itemInstanceId, { ...item, source, equipped });
    }
  };
  add(profile.profileInventory?.data?.items, 'vault');
  for (const [id, inventory] of Object.entries(profile.characterInventories?.data ?? {})) add(inventory.items, id);
  for (const [id, equipment] of Object.entries(profile.characterEquipment?.data ?? {})) add(equipment.items, id, true);
  return indexed;
}

async function detailsFor(item, profile = currentProfile) {
  const richDefinitionFor = (type, hash) => definitionFor(type === 'DestinyInventoryItemDefinition' ? 'DestinyInventoryItemStatsV1' : type, hash);
  const definition = await richDefinitionFor('DestinyInventoryItemDefinition', item.itemHash);
  const { socketDefinitions, socketPlugs, ...details } = await getGearDetails(item, definition, profile.itemComponents ?? {}, richDefinitionFor);
  const slots = getWeaponSlots(socketPlugs);
  const isWeapon = definition.itemType === 3;
  const isExotic = definition.inventory?.tierType === 6;
  const recommendation = isWeapon && !isExotic ? readyRecommendations?.get(normalize(definition.displayProperties?.name)) : null;
  return {
    ...details, slots, recommendation,
    aegisPending: isWeapon && !isExotic && !readyRecommendations,
    score: isWeapon && !isExotic ? scoreWeapon(slots, recommendation) : null,
    excluded: isExotic && isWeapon ? 'Exotic weapons are excluded from Aegis comparison.'
      : !isWeapon ? 'Armor is excluded from Aegis comparison.'
        : !readyRecommendations ? 'Aegis comparison is loading separately.'
          : !recommendation ? 'This weapon has no matching Aegis recommendation row.' : '',
  };
}

async function loadInventory(profile) {
  const indexed = indexItems(profile);
  const progressive = !rendererLoaded;
  currentProfile = profile;
  rawItems.clear();
  for (const [id, item] of indexed) rawItems.set(id, item);
  // Keep cached details for unchanged instances across the 60-second refresh.
  for (const [id, cached] of detailsCache) {
    const item = indexed.get(id);
    const signature = item && detailSignature(item, profile);
    if (!item || cached.signature !== signature) detailsCache.delete(id);
  }
  const snapshot = (gear, vault, vaultLoading, vaultCount) => ({
    characters: Object.entries(profile.characters?.data ?? {}).map(([id, character]) => ({
      id, className: CLASS_NAMES[character.classType] || 'Guardian', light: character.light,
      emblem: bungieImage(character.emblemBackgroundPath), gear: gear.filter((item) => item.source === id),
    })), vault, vaultLoading, vaultCount, refreshedAt: new Date().toISOString(),
  });
  const hydrate = async (item, background) => {
    const definition = await definitionFor('DestinyInventoryItemDefinition', item.itemHash, { background });
    if (definition.itemType !== 2 && definition.itemType !== 3) return null;
    const display = definition.displayProperties ?? {};
    return {
      id: item.itemInstanceId, itemHash: item.itemHash, source: item.source,
      equipped: item.equipped, transferable: !item.equipped && !item.transferStatus,
      bucket: definition.inventory?.bucketTypeHash ?? item.bucketHash,
      name: display.name || `Item ${item.itemHash}`, icon: bungieImage(display.icon),
      type: definition.itemType, category: definition.itemTypeDisplayName || 'Gear',
      tier: definition.inventory?.tierTypeName || '', tierType: definition.inventory?.tierType ?? 0,
      ...getGearState(item, profile.itemComponents?.instances?.data?.[item.itemInstanceId], definition),
      locked: Boolean(item.state & 1), detailVersion: detailSignature(item, profile),
      power: profile.itemComponents?.instances?.data?.[item.itemInstanceId]?.primaryStat?.value ?? null,
      slots: {}, stats: [], perks: [], score: null,
    };
  };
  const { characterGear, vaultGear } = await loadInventoryStages([...indexed.values()], hydrate,
    (gear, count) => progressive ? showCharacters(snapshot(gear, [], count > 0, count)) : undefined);
  return snapshot(characterGear, vaultGear, false, vaultGear.length);
}

function detailSignature(item, profile) {
  const components = profile.itemComponents ?? {};
  const id = item.itemInstanceId;
  return JSON.stringify([item.itemHash, item.state,
    components.instances?.data?.[id], components.sockets?.data?.[id],
    components.stats?.data?.[id], components.plugObjectives?.data?.[id]]);
}

ipcMain.handle('inventory:details', async (event, id) => {
  if (event.sender !== profileWindow?.webContents || typeof id !== 'string' || !rawItems.has(id)) throw new Error('Unknown item.');
  if (!detailsCache.has(id)) {
    const profile = currentProfile;
    const item = rawItems.get(id);
    const pending = detailsFor(item, profile).catch((error) => {
      if (detailsCache.get(id) === pending) detailsCache.delete(id);
      throw error;
    });
    pending.signature = detailSignature(item, profile);
    detailsCache.set(id, pending);
  }
  return detailsCache.get(id);
});

ipcMain.handle('inventory:transfer', async (event, request) => {
  if (event.sender !== profileWindow?.webContents) throw new Error('Invalid inventory request.');
  if (transferBusy || refreshing) return { ok: false, message: 'Inventory is busy refreshing. Try again in a moment.' };
  if (!request || typeof request.id !== 'string' || typeof request.destination !== 'string') return { ok: false, message: 'Invalid transfer.' };
  transferBusy = true;
  let message;
  let ok = false;
  try {
    // Check current server state so stale UI cannot move an equipped or relocated item.
    const fresh = await getProfile(currentMembership.membershipType, currentMembership.membershipId);
    const item = indexItems(fresh).get(request.id);
    if (!item || item.source !== request.source) throw new Error('The item moved since the last refresh. Try again.');
    const definition = await definitionFor('DestinyInventoryItemDefinition', item.itemHash);
    if (![2, 3].includes(definition.itemType)) throw new Error('Only weapons and armor can be transferred.');
    const steps = planTransfer(item, item.source, request.destination, Object.keys(fresh.characters?.data ?? {}), currentMembership.membershipType);
    await executeTransfer(steps, transferItem);
    ok = true;
    message = 'Item transferred.';
  } catch (error) { message = error.message; }
  finally {
    try {
      const profile = await getProfile(currentMembership.membershipType, currentMembership.membershipId);
      await showCharacters(await loadInventory(profile));
    } catch (error) { message += ` Inventory refresh failed: ${error.message}`; }
    transferBusy = false;
  }
  return { ok, message };
});

async function showCharacters(inventory) {
  if (quitting) return;
  displayedInventory = inventory;
  if (rendererLoaded && profileWindow && !profileWindow.isDestroyed()) {
    profileWindow.webContents.send("inventory:update", inventory);
    warmRecommendations();
    return;
  }
  if (!profileWindow || profileWindow.isDestroyed()) {
    profileWindow = new BrowserWindow({
      title: "Project MinMax",
      width: 1180,
      height: 820,
      ...profileWindowChrome(),
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      hasShadow: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    const currentWindow = profileWindow;
    const currentOverlay = await configureOverlay(currentWindow);
    overlayState = currentOverlay;
    if (quitting || currentWindow.isDestroyed()) { currentOverlay.dispose(); return; }
    currentWindow.once("closed", () => {
      currentOverlay.dispose();
      if (profileWindow === currentWindow) { profileWindow = undefined; rendererLoaded = false; }
    });
  }
  profileWindowShown = true;
  const payload = JSON.stringify(inventory).replaceAll("<", "\\u003c");
  const page = rendererTemplate
    .replace("<html>", () => overlayState.isCleared() ? '<html class="overlay-clear">' : "<html>")
    .replace("__PROFILE_DATA__", () => payload)
    .replace("__REFRESH_TIME__", () => new Date().toLocaleTimeString())
    .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${rendererStyles}</style>`)
    .replace('<script src="./app.js"></script>', () => `<script>${rendererScript}</script>`);
  await profileWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
  rendererLoaded = true;
  warmRecommendations();
}

let refreshing = false;
let refreshTimer;

async function loadDestinyProfile() {
  if (quitting || refreshing || transferBusy) return;
  refreshing = true;
  try {
    const memberships = await getMemberships();
    const destinyMembership = memberships.destinyMemberships?.find((membership) => membership.membershipType === membership.crossSaveOverride)
      ?? memberships.destinyMemberships?.[0];
    if (!destinyMembership) throw new Error("No Destiny membership was found for this Bungie account.");
    const profile = await getProfile(destinyMembership.membershipType, destinyMembership.membershipId);
    if (quitting) return;
    currentMembership = destinyMembership;
    await showCharacters(await loadInventory(profile));
  } catch (error) {
    console.error("Could not load Bungie data:", error);
    if (!quitting && displayedInventory?.vaultLoading) {
      await showCharacters({ ...displayedInventory, vaultLoading: false, vaultError: 'Vault could not load: ' + error.message });
    }
  } finally {
    refreshing = false;
  }
}

app.whenReady().then(async () => {
  await loadDestinyProfile();
  if (!quitting) refreshTimer = setInterval(loadDestinyProfile, 60_000);
});
app.on("window-all-closed", () => {
  if (profileWindowShown && !quitting) app.quit();
});
app.on("before-quit", () => { quitting = true; clearInterval(refreshTimer); overlayState?.dispose(); });

app.once("before-quit", (event) => {
  event.preventDefault();
  Promise.allSettled([definitions.flush(), recommendationStore.flush()]).then(() => app.quit());
});
