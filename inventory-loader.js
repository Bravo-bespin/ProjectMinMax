// Publish character gear before doing any cold vault-definition lookups.
export async function loadInventoryStages(items, hydrate, publishCharacters) {
  const characterItems = items.filter((item) => item.source !== 'vault');
  const vaultItems = items.filter((item) => item.source === 'vault');
  const equipped = characterItems.filter((item) => item.equipped);
  const first = equipped.length ? equipped : characterItems;
  const characterGear = (await Promise.all(first.map((item) => hydrate(item, false)))).filter(Boolean);
  await publishCharacters(characterGear, vaultItems.length);
  if (equipped.length && equipped.length < characterItems.length) {
    const carried = characterItems.filter((item) => !item.equipped);
    characterGear.push(...(await Promise.all(carried.map((item) => hydrate(item, false)))).filter(Boolean));
    await publishCharacters(characterGear, vaultItems.length);
  }
  const vaultGear = (await Promise.all(vaultItems.map((item) => hydrate(item, true)))).filter(Boolean);
  return { characterGear, vaultGear };
}
