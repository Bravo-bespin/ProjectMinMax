export function planTransfer(item, source, destination, characterIds, membershipType) {
  if (!item?.itemInstanceId) throw new Error('Only instanced weapons and armor can be transferred.');
  if (item.equipped) throw new Error('Unequip this item in Destiny 2 before transferring it.');
  if (item.transferStatus) throw new Error('Bungie currently marks this item as non-transferable.');
  const valid = (location) => location === 'vault' || characterIds.includes(location);
  if (!valid(source) || !valid(destination) || source === destination) throw new Error('Choose a different valid destination.');
  const base = { itemReferenceHash: item.itemHash, itemId: item.itemInstanceId, stackSize: 1, membershipType };
  const steps = [];
  if (source !== 'vault') steps.push({ ...base, characterId: source, transferToVault: true });
  if (destination !== 'vault') steps.push({ ...base, characterId: destination, transferToVault: false });
  return steps;
}

export async function executeTransfer(steps, send) {
  for (let index = 0; index < steps.length; index++) {
    try {
      // Bungie requires 0.1 seconds between item actions per account.
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 100));
      await send(steps[index]);
    } catch (error) {
      if (index > 0) throw new Error(`The item reached the vault, but the move to the character failed: ${error.message}`);
      throw error;
    }
  }
}
