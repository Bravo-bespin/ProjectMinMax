import { getMemberships, getProfile } from "./api.js";

async function loadDestinyProfile() {
  try {
    const memberships = await getMemberships();

    const destinyMembership = memberships.destinyMemberships[0];
    const profile = await getProfile(
      destinyMembership.membershipType,
      destinyMembership.membershipId
    );

    console.log(profile);
  } catch (error) {
    console.error("Could not load Bungie data:", error);
  }
}

loadDestinyProfile();