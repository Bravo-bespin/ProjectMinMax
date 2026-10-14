import Bungo from "bungie-auth/electron";

const bungie = new Bungo({
  key: process.env.BUNGIE_API_KEY,
  url: "https://www.bungie.net/en/OAuth/Authorize",
});

function getAccessToken() {
  return new Promise((resolve, reject) => {
    bungie.token((err, payload) => {
      if (err) return reject(err);

      resolve(payload.accessToken.value);
    });
  });
}

async function bungieGet(path) {
  const token = await getAccessToken();

  const response = await fetch(`https://www.bungie.net/Platform${path}`, {
    headers: {
      "X-API-Key": process.env.BUNGIE_API_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await response.json();

  if (!response.ok || body.ErrorCode !== 1) {
    throw new Error(body.Message || "Bungie API request failed");
  }

  return body.Response;
}

export function getCurrentUser() {
  return bungieGet("/User/GetCurrentBungieNetUser/");
}

export function getMemberships() {
  return bungieGet("/User/GetMembershipsForCurrentUser/");
}

export function getProfile(membershipType, membershipId) {
  return bungieGet(
    `/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`
  );
}