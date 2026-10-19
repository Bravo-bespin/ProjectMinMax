import { app, BrowserWindow, ipcMain } from "electron";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { configureOverlay } from "./overlay.js";
import { getGearDetails } from "./gear-details.js";
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

const AEGIS_SHEET_ID = "1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY";
const AEGIS_SHEETS = [
  "Autos", "Bows", "HCs", "Pulses", "Scouts", "Sidearms", "SMGs", "BGLs",
  "Fusions", "Glaives", "Shotguns", "Snipers", "Rocket Sidearms", "Traces",
  "HGLs", "LFRs", "LMGs", "Rockets", "Swords",
];
const CLASS_NAMES = ["Titan", "Hunter", "Warlock"];

let profileWindowShown = false;
let aegisRecommendations;
let profileWindow;
let overlayState;
const definitionCache = new Map();

function bungieImage(path) {
  return path ? `https://www.bungie.net${path}` : "";
}

function normalize(value) {
  return String(value ?? "")
    .replace(/^enhanced\s+/i, "")
    .replace(/\n.*/s, "")
    .replace(/[’']/g, "'")
    .trim()
    .toLowerCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value)) rows.push(row);
  return rows;
}

function recommendationOptions(value) {
  return String(value ?? "")
    .split("\n")
    .map(normalize)
    .filter(Boolean);
}

async function loadAegisRecommendations() {
  if (aegisRecommendations) return aegisRecommendations;

  aegisRecommendations = (async () => {
    const results = await Promise.all(AEGIS_SHEETS.map(async (sheet) => {
      const url = new URL(`https://docs.google.com/spreadsheets/d/${AEGIS_SHEET_ID}/gviz/tq`);
      url.search = new URLSearchParams({ tqx: "out:csv", sheet });
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load Aegis recommendations for ${sheet}`);
      return parseCsv(await response.text());
    }));
    const recommendations = new Map();

    for (const rows of results) {
      const [headers = [], ...weapons] = rows;
      const index = (name) => headers.findIndex((header) => header === name || header.endsWith(` ${name}`));
      const nameIndex = index("Name");
      const barrelIndex = index("Barrel");
      const magazineIndex = index("Mag");
      const perkOneIndex = index("Perk 1");
      const perkTwoIndex = index("Perk 2");

      for (const weapon of weapons) {
        const name = normalize(weapon[nameIndex]);
        if (!name) continue;
        recommendations.set(name, {
          barrel: recommendationOptions(weapon[barrelIndex]),
          magazine: recommendationOptions(weapon[magazineIndex]),
          perkOne: recommendationOptions(weapon[perkOneIndex]),
          perkTwo: recommendationOptions(weapon[perkTwoIndex]),
        });
      }
    }
    return recommendations;
  })().catch((error) => {
    aegisRecommendations = undefined;
    throw error;
  });

  return aegisRecommendations;
}

function getWeaponSlots(socketDefinitions) {
  const slots = { barrel: "", magazine: "", perkOne: "", perkTwo: "" };
  const traits = [];

  for (const definition of socketDefinitions) {
    const category = definition.plug?.plugCategoryIdentifier ?? "";
    const name = definition.displayProperties?.name;
    if (!name) continue;
    if (category.includes("barrel") && !slots.barrel) slots.barrel = name;
    if (category.includes("magazine") && !slots.magazine) slots.magazine = name;
    if (category.includes("trait")) traits.push(name);
  }

  [slots.perkOne, slots.perkTwo] = traits;
  return slots;
}

function scoreWeapon(slots, recommendation) {
  if (!recommendation) return null;
  const fields = ["barrel", "magazine", "perkOne", "perkTwo"];
  const matches = {};
  for (const field of fields) {
    matches[field] = Boolean(slots[field]) && recommendation[field].includes(normalize(slots[field]));
  }
  return { matches, value: Object.values(matches).filter(Boolean).length, total: fields.length };
}

let currentProfile;
let currentMembership;
let transferBusy = false;
let rendererLoaded = false;
const rawItems = new Map();
const detailsCache = new Map();
let pendingDefinitions = 0;
const definitionQueue = [];

async function fetchDefinition(type, hash) {
  if (pendingDefinitions >= 6) await new Promise((resolve) => definitionQueue.push(resolve));
  pendingDefinitions++;
  try { return await getManifestDefinition(type, hash); }
  finally { pendingDefinitions--; definitionQueue.shift()?.(); }
}

function definitionFor(type, hash) {
  const key = `${type}:${hash}`;
  if (!definitionCache.has(key)) {
    definitionCache.set(key, fetchDefinition(type, hash).catch((error) => {
      definitionCache.delete(key);
      throw error;
    }));
  }
  return definitionCache.get(key);
}

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
  const definition = await definitionFor('DestinyInventoryItemDefinition', item.itemHash);
  const { socketDefinitions, ...details } = await getGearDetails(item, definition, profile.itemComponents ?? {}, definitionFor);
  const slots = getWeaponSlots(socketDefinitions);
  const recommendations = await loadAegisRecommendations().catch((error) => {
    console.error('Could not load Aegis recommendations:', error.message);
    return new Map();
  });
  const isWeapon = definition.itemType === 3;
  const isExotic = definition.inventory?.tierType === 6;
  const recommendation = isWeapon && !isExotic ? recommendations.get(normalize(definition.displayProperties?.name)) : null;
  return {
    ...details, slots, recommendation,
    score: isWeapon && !isExotic ? scoreWeapon(slots, recommendation) : null,
    excluded: isExotic && isWeapon ? 'Exotic weapons are excluded from Aegis comparison.'
      : !isWeapon ? 'Armor is excluded from Aegis comparison.'
        : !recommendation ? 'This weapon has no matching Aegis recommendation row.' : '',
  };
}

async function loadInventory(profile) {
  const indexed = indexItems(profile);
  const gear = await Promise.all([...indexed.values()].map(async (item) => {
    const definition = await definitionFor('DestinyInventoryItemDefinition', item.itemHash);
    if (definition.itemType !== 2 && definition.itemType !== 3) return null;
    const display = definition.displayProperties ?? {};
    return {
      id: item.itemInstanceId, itemHash: item.itemHash, source: item.source,
      equipped: item.equipped, transferable: !item.equipped && !item.transferStatus,
      bucket: definition.inventory?.bucketTypeHash ?? item.bucketHash,
      name: display.name || `Item ${item.itemHash}`, icon: bungieImage(display.icon),
      type: definition.itemType, category: definition.itemTypeDisplayName || 'Gear',
      tier: definition.inventory?.tierTypeName || '', tierType: definition.inventory?.tierType ?? 0,
      locked: Boolean(item.state & 1),
      power: profile.itemComponents?.instances?.data?.[item.itemInstanceId]?.primaryStat?.value ?? null,
      slots: {}, stats: [], perks: [], score: null,
    };
  }));
  const items = gear.filter(Boolean);
  const characters = Object.entries(profile.characters?.data ?? {}).map(([id, character]) => ({
    id, className: CLASS_NAMES[character.classType] || 'Guardian', light: character.light,
    emblem: bungieImage(character.emblemBackgroundPath),
    gear: items.filter((item) => item.source === id),
  }));
  currentProfile = profile;
  rawItems.clear();
  for (const [id, item] of indexed) rawItems.set(id, item);
  detailsCache.clear();
  return { characters, vault: items.filter((item) => item.source === 'vault'), refreshedAt: new Date().toISOString() };
}

ipcMain.handle('inventory:details', async (event, id) => {
  if (event.sender !== profileWindow?.webContents || typeof id !== 'string' || !rawItems.has(id)) throw new Error('Unknown item.');
  if (!detailsCache.has(id)) {
    const profile = currentProfile;
    detailsCache.set(id, detailsFor(rawItems.get(id), profile).catch((error) => {
      detailsCache.delete(id);
      throw error;
    }));
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
  if (rendererLoaded && profileWindow && !profileWindow.isDestroyed()) {
    profileWindow.webContents.send("inventory:update", inventory);
    return;
  }
  if (!profileWindow || profileWindow.isDestroyed()) {
    profileWindow = new BrowserWindow({
      title: "Project MinMax",
      width: 1180,
      height: 820,
      frame: false,
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
    overlayState = await configureOverlay(profileWindow);
    profileWindow.on("closed", () => { overlayState.dispose(); profileWindow = undefined; });
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
}

let refreshing = false;
let refreshTimer;

async function loadDestinyProfile() {
  if (refreshing || transferBusy) return;
  refreshing = true;
  try {
    const memberships = await getMemberships();
    const destinyMembership = memberships.destinyMemberships?.find((membership) => membership.membershipType === membership.crossSaveOverride)
      ?? memberships.destinyMemberships?.[0];
    if (!destinyMembership) throw new Error("No Destiny membership was found for this Bungie account.");
    const profile = await getProfile(destinyMembership.membershipType, destinyMembership.membershipId);
    currentMembership = destinyMembership;
    await showCharacters(await loadInventory(profile));
  } catch (error) {
    console.error("Could not load Bungie data:", error);
  } finally {
    refreshing = false;
  }
}

app.whenReady().then(async () => {
  await loadDestinyProfile();
  refreshTimer = setInterval(loadDestinyProfile, 60_000);
});
app.on("window-all-closed", () => {
  if (profileWindowShown) app.quit();
});
app.on("before-quit", () => clearInterval(refreshTimer));
