import { applyWeaponStatBonuses, isEnhancedWeaponPlug, isMasterworkPlug } from './weapon-stats.js';
const STAT_ORDER = [
  'Impact', 'Range', 'Accuracy', 'Stability', 'Handling', 'Reload Speed',
  'Blast Radius', 'Velocity', 'Charge Rate', 'Guard Resistance', 'Guard Endurance',
  'Swing Speed', 'Shield Duration', 'Charge Time', 'Draw Time',
  'Rounds Per Minute', 'Magazine', 'Ammo Capacity',
  'Mobility', 'Resilience', 'Recovery', 'Discipline', 'Intellect', 'Strength',
  'Health', 'Melee', 'Grenade', 'Super', 'Class', 'Weapons',
];
const NUMERIC_STATS = new Set(['Charge Time', 'Draw Time', 'Rounds Per Minute', 'Magazine', 'Ammo Capacity']);

export function getGearState(item, instance = {}, definition = {}) {
  // Enhanced random rolls can also carry Crafted; only pattern weapons are shaped.
  const craftingState = Boolean(item.state & 8);
  const hasRecipe = Boolean(definition.inventory?.recipeItemHash);
  return {
    gearTier: Number.isInteger(instance.gearTier) && instance.gearTier >= 1 && instance.gearTier <= 5 ? instance.gearTier : null,
    masterworked: Boolean(item.state & 4),
    crafted: craftingState && hasRecipe,
    enhanced: Boolean(item.state & 32) || (craftingState && !hasRecipe),
  };
}

export async function getGearDetails(item, definition, components, definitionFor) {
  const id = item.itemInstanceId;
  const sockets = components.sockets?.data?.[id]?.sockets ?? [];
  const activeSockets = sockets.map((socket, socketIndex) => ({ ...socket, socketIndex }))
    .filter((socket) => socket.plugHash && socket.isEnabled !== false);
  const plugsPromise = Promise.all(activeSockets.map((socket) => definitionFor('DestinyInventoryItemDefinition', socket.plugHash)));
  const stats = components.stats?.data?.[id]?.stats ?? {};
  const statsPromise = Promise.all(Object.entries(stats).map(async ([hash, stat]) => {
    const meta = await definitionFor('DestinyStatDefinition', hash);
    const name = meta.displayProperties?.name;
    return { hash, name, value: stat.value, numeric: NUMERIC_STATS.has(name) };
  }));
  const objectives = components.plugObjectives?.data?.[id]?.objectivesPerPlug ?? {};
  const trackersPromise = Promise.all(activeSockets.flatMap((socket) => objectives[socket.plugHash] ?? []).map(async (objective) => {
    const meta = await definitionFor('DestinyObjectiveDefinition', objective.objectiveHash);
    return { label: meta.progressDescription || '', value: objective.progress };
  }));
  const groupPromise = definition.itemType === 3 && definition.stats?.statGroupHash
    ? definitionFor('DestinyStatGroupDefinition', definition.stats.statGroupHash).catch(() => undefined) : undefined;
  const [plugs, resolvedStats, trackers, statGroup] = await Promise.all([plugsPromise, statsPromise, trackersPromise, groupPromise]);
  const state = getGearState(item, components.instances?.data?.[id], definition);
  const perks = plugs.filter((plug) => {
    // Legacy armor includes unnamed internal plugs that are not visible perks.
    if (!plug.displayProperties?.name?.trim()) return false;
    if (definition.itemType === 2 && /^upgrade armou?r$/i.test(plug.displayProperties.name.trim())) return false;
    const category = plug.plug?.plugCategoryIdentifier ?? '';
    return /intrinsic|trait|origin|barrel|tubes|magazine|scope|blade|guard|grip|stock|bowstring|arrow|armor\.mods/.test(category) || category === "frames";
  }).map((plug) => ({
    name: plug.displayProperties.name,
    description: plug.displayProperties?.description || '',
    icon: plug.displayProperties?.icon ? `https://www.bungie.net${plug.displayProperties.icon}` : '',
    intrinsic: /intrinsic/.test(plug.plug?.plugCategoryIdentifier ?? ''),
    enhanced: isEnhancedWeaponPlug(plug),
    type: plug.itemTypeDisplayName || '',
  }));
  perks.sort((a, b) => Number(b.intrinsic) - Number(a.intrinsic));
  const masterworkPlug = definition.itemType === 2 ? undefined : plugs.find(isMasterworkPlug);
  return {
    ...state,
    masterwork: masterworkPlug ? {
      name: masterworkPlug.displayProperties?.name || 'Masterwork',
      icon: masterworkPlug.displayProperties?.icon ? `https://www.bungie.net${masterworkPlug.displayProperties.icon}` : '',
    } : null,
    socketDefinitions: plugs,
    socketPlugs: plugs.map((definition, index) => ({ socketIndex: activeSockets[index].socketIndex, definition })),
    stats: applyWeaponStatBonuses(resolvedStats, definition, plugs, state, statGroup).filter((stat) => STAT_ORDER.includes(stat.name) && Number.isFinite(stat.value))
      .sort((a, b) => STAT_ORDER.indexOf(a.name) - STAT_ORDER.indexOf(b.name)),
    perks,
    tracker: trackers.find((tracker) => /defeated|final blows|kills/i.test(tracker.label) && Number.isFinite(tracker.value)) ?? null,
    ammo: ['', 'Primary', 'Special', 'Heavy'][definition.equippingBlock?.ammoType] || '',
    damage: ['', 'Kinetic', 'Arc', 'Solar', 'Void', 'Raid', 'Stasis', 'Strand'][components.instances?.data?.[id]?.damageType] || '',
    locked: Boolean(item.state & 1),
    tierType: definition.inventory?.tierType ?? 0,
  };
}
