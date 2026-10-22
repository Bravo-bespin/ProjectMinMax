function category(plug) { return plug.plug?.plugCategoryIdentifier ?? ''; }
export function isGameplayTrait(plug) {
  const value = category(plug);
  return !/intrinsic/i.test(plug.itemTypeDisplayName ?? '') && !/intrinsic|origin/.test(value)
    && (value === 'frames' || /(^|\.)traits?$/.test(value));
}
export function isEnhancedWeaponPlug(plug) {
  const value = category(plug).toLowerCase();
  const type = plug.itemTypeDisplayName ?? '';
  if (/intrinsic/i.test(type) || /intrinsic|masterwork/.test(value)) return false;
  const eligible = isGameplayTrait(plug) || /barrel|tubes|magazine|origin|scope|bowstring|arrow|blade|guard|grip|stock/.test(value);
  return eligible && (/\benhanced\b/i.test(type) || /^enhanced\s/i.test(plug.displayProperties?.name ?? ''));
}

export function isMasterworkPlug(plug) {
  return /masterworks?\.stat\./.test(category(plug));
}

export function scaleStat(value, scaling, maximum = 100) {
  const points = [...(scaling?.displayInterpolation ?? [])].sort((a, b) => a.value - b.value);
  const capped = Math.max(0, Math.min(maximum, value));
  if (!points.length) return Math.round(capped);
  if (capped <= points[0].value) return Math.round(points[0].weight);
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    if (capped <= end.value) return Math.round(start.weight + (end.weight - start.weight) * (capped - start.value) / (end.value - start.value));
  }
  return Math.round(points.at(-1).weight);
}

// Attribute only supported, verifiable investment-stat contributions. Instance
// totals stay authoritative when unmodeled conditional perks change a stat.
export function applyWeaponStatBonuses(stats, definition, plugs, state, statGroup) {
  if (definition.itemType !== 3 || !definition.investmentStats?.length) return stats;
  const base = new Map();
  const masterwork = new Map();
  const tier = new Map();
  const add = (map, hash, value) => map.set(String(hash), (map.get(String(hash)) ?? 0) + value);
  for (const stat of definition.investmentStats) if (!stat.isConditionallyActive) add(base, stat.statTypeHash, stat.value);
  for (const plug of plugs) {
    const investments = plug.investmentStats ?? [];
    const intrinsic = /intrinsic/.test(category(plug));
    const craftedStatFrame = intrinsic && (state.crafted || state.enhanced) && investments.some((stat) => !stat.isConditionallyActive && stat.value === 10);
    const isMW = isMasterworkPlug(plug) || craftedStatFrame;
    const target = isMW ? masterwork : base;
    for (const stat of investments) if (!stat.isConditionallyActive) add(target, stat.statTypeHash, stat.value);
    // Conditional encoding reference: https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/store/stats-conditional.ts
    // New tiered masterworks encode their +gearTier bonuses as conditional zero
    // entries. These bonuses apply only at the full masterwork, once per stat.
    const tieredMW = isMasterworkPlug(plug) && plug.plug?.uiPlugLabel === 'masterwork'
      && investments.some((stat) => stat.isConditionallyActive && stat.value === 0);
    if (state.masterworked && state.gearTier && (tieredMW || craftedStatFrame)) {
      const hashes = new Set(investments.filter((stat) => !stat.isConditionallyActive || stat.value === 0 || craftedStatFrame && stat.value === 2).map((stat) => stat.statTypeHash));
      for (const hash of hashes) add(tier, hash, state.gearTier);
    }
  }
  return stats.map((stat) => {
    const hash = String(stat.hash);
    if (!base.has(hash)) return stat;
    const mw = masterwork.get(hash) ?? 0;
    const tierBonus = tier.get(hash) ?? 0;
    if (!mw && !tierBonus) return stat;
    const scaling = statGroup?.scaledStats?.find((entry) => String(entry.statHash) === hash);
    if (!scaling) return stat;
    const maximum = scaling.maximumValue || statGroup.maximumValue || 100;
    const original = scaleStat(base.get(hash), scaling, maximum);
    const withMW = scaleStat(base.get(hash) + mw, scaling, maximum);
    const total = scaleStat(base.get(hash) + mw + tierBonus, scaling, maximum);
    // Some API totals omit the tier bonus. Otherwise, a disagreement means an
    // unsupported condition is active: keep the reported value without guessing.
    if (stat.value !== total && !(tierBonus && stat.value === withMW)) return stat;
    return { ...stat, value: total, baseValue: original, masterworkBonus: withMW - original, tierBonus: total - withMW };
  });
}
