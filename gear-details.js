const STAT_ORDER = [
  'Impact', 'Range', 'Accuracy', 'Stability', 'Handling', 'Reload Speed',
  'Blast Radius', 'Velocity', 'Charge Rate', 'Guard Resistance', 'Guard Endurance',
  'Swing Speed', 'Shield Duration', 'Charge Time', 'Draw Time',
  'Rounds Per Minute', 'Magazine', 'Ammo Capacity',
  'Mobility', 'Resilience', 'Recovery', 'Discipline', 'Intellect', 'Strength',
  'Health', 'Melee', 'Grenade', 'Super', 'Class', 'Weapons',
];
const NUMERIC_STATS = new Set(['Charge Time', 'Draw Time', 'Rounds Per Minute', 'Magazine', 'Ammo Capacity']);

export async function getGearDetails(item, definition, components, definitionFor) {
  const id = item.itemInstanceId;
  const sockets = components.sockets?.data?.[id]?.sockets ?? [];
  const activeSockets = sockets.filter((socket) => socket.plugHash && socket.isEnabled !== false);
  const plugs = await Promise.all(activeSockets.map((socket) => definitionFor('DestinyInventoryItemDefinition', socket.plugHash)));
  const stats = components.stats?.data?.[id]?.stats ?? {};
  const resolvedStats = await Promise.all(Object.entries(stats).map(async ([hash, stat]) => {
    const meta = await definitionFor('DestinyStatDefinition', hash);
    const name = meta.displayProperties?.name;
    return { name, value: stat.value, numeric: NUMERIC_STATS.has(name) };
  }));
  const objectives = components.plugObjectives?.data?.[id]?.objectivesPerPlug ?? {};
  const trackers = await Promise.all(activeSockets.flatMap((socket) => objectives[socket.plugHash] ?? []).map(async (objective) => {
    const meta = await definitionFor('DestinyObjectiveDefinition', objective.objectiveHash);
    return { label: meta.progressDescription || '', value: objective.progress };
  }));
  const perks = plugs.filter((plug) => {
    const category = plug.plug?.plugCategoryIdentifier ?? '';
    return /intrinsic|trait|origin|barrel|magazine|scope|blade|guard|grip|stock|bowstring|arrow|armor\.mods/.test(category);
  }).map((plug) => ({
    name: plug.displayProperties?.name || 'Unknown perk',
    description: plug.displayProperties?.description || '',
    icon: plug.displayProperties?.icon ? `https://www.bungie.net${plug.displayProperties.icon}` : '',
    intrinsic: /intrinsic/.test(plug.plug?.plugCategoryIdentifier ?? ''),
  }));
  perks.sort((a, b) => Number(b.intrinsic) - Number(a.intrinsic));
  return {
    socketDefinitions: plugs,
    stats: resolvedStats.filter((stat) => STAT_ORDER.includes(stat.name) && Number.isFinite(stat.value))
      .sort((a, b) => STAT_ORDER.indexOf(a.name) - STAT_ORDER.indexOf(b.name)),
    perks,
    tracker: trackers.find((tracker) => /defeated|final blows|kills/i.test(tracker.label) && Number.isFinite(tracker.value)) ?? null,
    ammo: ['', 'Primary', 'Special', 'Heavy'][definition.equippingBlock?.ammoType] || '',
    damage: ['', 'Kinetic', 'Arc', 'Solar', 'Void', 'Raid', 'Stasis', 'Strand'][components.instances?.data?.[id]?.damageType] || '',
    locked: Boolean(item.state & 1),
    tierType: definition.inventory?.tierType ?? 0,
  };
}
