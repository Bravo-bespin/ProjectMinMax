import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";

const API_ROOT = "https://www.bungie.net/Platform";
const AUTHORIZE_URL = "https://www.bungie.net/en/oauth/authorize";
const TOKEN_URL = `${API_ROOT}/App/OAuth/Token/`;
const REDIRECT_URL = "https://localhost/callback";

let accessToken;
let authorization;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Set it before starting Project MinMax.`);
  return value;
}

async function getAccessToken() {
  if (accessToken) return accessToken;
  if (!authorization) {
    authorization = authorizeAccessToken().finally(() => { authorization = undefined; });
  }
  return authorization;
}

async function authorizeAccessToken() {

  const apiKey = requiredEnvironment("BUNGIE_API_KEY");
  const clientId = requiredEnvironment("BUNGIE_CLIENT_ID");
  const state = randomUUID();
  const authorize = new URL(AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URL,
    state,
  });

  const code = await requestAuthorizationCode(authorize, state);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-Key": apiKey,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URL,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.Message || "Bungie token request failed");
  }

  accessToken = body.access_token;
  return accessToken;
}

function requestAuthorizationCode(authorizeUrl, expectedState) {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({
      autoHideMenuBar: true,
      width: 1000,
      height: 760,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    let complete = false;

    const finish = (error, code) => {
      if (complete) return;
      complete = true;
      if (!window.isDestroyed()) window.close();
      error ? reject(error) : resolve(code);
    };
    const handleNavigation = (event, target) => {
      const callback = new URL(target);
      const redirect = new URL(REDIRECT_URL);
      if (callback.origin !== redirect.origin || callback.pathname !== redirect.pathname) return;
      event.preventDefault();
      if (callback.searchParams.get("state") !== expectedState) {
        finish(new Error("Bungie OAuth state validation failed"));
        return;
      }
      const code = callback.searchParams.get("code");
      finish(code ? undefined : new Error("Bungie did not return an authorization code"), code);
    };

    window.webContents.on("will-redirect", handleNavigation);
    window.webContents.on("will-navigate", handleNavigation);
    window.on("closed", () => finish(new Error("Bungie sign-in window was closed")));
    window.loadURL(authorizeUrl.toString()).catch(finish);
  });
}

async function bungieGet(path) {
  const [token, apiKey] = await Promise.all([
    getAccessToken(),
    requiredEnvironment("BUNGIE_API_KEY"),
  ]);
  const response = await fetch(`${API_ROOT}${path}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { "X-API-Key": apiKey, Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  if (!response.ok || body.ErrorCode !== 1) {
    throw new Error(body.Message || "Bungie API request failed");
  }
  return body.Response;
}

export function getMemberships() {
  return bungieGet("/User/GetMembershipsForCurrentUser/");
}

export function getProfile(membershipType, membershipId) {
  return bungieGet(`/Destiny2/${membershipType}/Profile/${membershipId}/?components=102,200,201,205,300,301,304,305,309`);
}

export function getInventoryItemDefinition(itemHash) {
  return bungieGet(`/Destiny2/Manifest/DestinyInventoryItemDefinition/${itemHash}/`);
}

export function getManifestDefinition(type, hash) {
  return bungieGet(`/Destiny2/Manifest/${type}/${hash}/`);
}

export async function transferItem(request) {
  const token = await getAccessToken();
  const response = await fetch(`${API_ROOT}/Destiny2/Actions/Items/TransferItem/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": requiredEnvironment("BUNGIE_API_KEY"),
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });
  const body = await response.json();
  if (!response.ok || body.ErrorCode !== 1) throw new Error(body.Message || "Bungie item transfer failed");
  return body.Response;
}
