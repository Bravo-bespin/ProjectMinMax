# Project MinMax

An Electron app that displays your Destiny 2 characters, carried gear, and vault.
Legendary weapons are compared with Aegis recommendations for barrel, magazine,
and two perk slots. Armor and exotic weapons are excluded from scoring.
Profiles refresh every minute while the app is open.

## Setup

Use Node.js 22.12 or later and install the locked dependencies:

```bash
npm ci
```

Create a public OAuth application in the Bungie Application Portal with the
registered redirect URL `https://localhost/callback`, then start the app:

```bash
BUNGIE_API_KEY="your-api-key" BUNGIE_CLIENT_ID="your-client-id" npm start
```

Sign in through the Bungie window to view your Guardians. Select a Guardian and
hover over equipped gear for details. The app requires internet access to Bungie
and the public Aegis Google spreadsheet. Credentials are loaded from the project’s ignored `.env` file or the environment.
You can save `BUNGIE_API_KEY` and `BUNGIE_CLIENT_ID` in `.env` and run `npm start`. Load failures are logged to the terminal
and retried on the next refresh.

## Development

```bash
npm run check
```

- `app.js`: Electron lifecycle, profile loading, and recommendation scoring.
- `api.js`: Bungie OAuth and API requests.
- `renderer/`: profile page markup, styles, and browser-side interactions.

The renderer files are composed into the profile page by the main process.

## Destiny 2 overlay

Run Destiny 2 in windowed or borderless windowed mode. Project MinMax uses
`electron-overlay-window` to follow the game window titled `Destiny 2`. Override
that title with `DESTINY_WINDOW_TITLE` in `.env` if needed. Exclusive fullscreen
is not supported by this desktop overlay.

Click **Clear overlay** to make the entire window invisible and pass clicks to
the game. Tap **M twice within 350 ms** to restore the interface and interact
with it. Holding M does not count. These keys also reach the game, so its M binding
may run. Profile refreshes do not restore the cleared window. Drag the header to
move the app when it is not attached to the game; use **Close** to quit.

On macOS, enable Accessibility for the running app (Electron during development)
in System Settings → Privacy & Security. The clear button prompts if needed and
keeps the interface visible until the global keyboard listener is ready. Window
tracking may also require Screen Recording permission. On Linux the library
requires X11/XWayland. If native attachment fails, the app remains an always-on-top
window and shows the error in its status line.

Run `npm test` to check double-tap timing, key-repeat handling, and reset behavior.

Run `npm run test:overlay` for an Electron smoke test of the native module, preload,
clear state across refreshes, and simulated double-M restoration. Full restoration
checks run when Accessibility permission is available.

## Inventory and transfers

Character screens arrange Kinetic, Energy, and Power weapons down the left, and
Helmet, Gauntlets, Chest, Boots, and Class item down the right. Equipped items
have a gold border; carried alternatives appear below each slot. The center
shows the Guardian’s class, power, and emblem background.

Hover or keyboard-focus an item for a Destiny-style card with its rarity, power,
instance stats, active perk icons, selected kill tracker when available, and
Aegis comparison. Details load on demand and are cached until the next refresh.
Stats unavailable from Bungie are omitted. The tooltip stays inside the window.

Open **Vault** to search and filter stored weapons and armor. Use **↗** on an
unequipped item, select a destination, then click **Transfer**. Moves between
characters route through the vault. If the second step fails, the item remains
in the vault and the app reports that location. Equipped or non-transferable
items cannot be moved; unequip them in-game first. Postmaster items are excluded.

The Bungie OAuth app must have the **MoveEquipDestinyItems** scope enabled for
transfers (see [Bungie TransferItem documentation](https://bungie-net.github.io/multi/operation_post_Destiny2-TransferItem.html)).
After changing scopes in the Bungie Application Portal, restart and sign in again.
Bungie errors such as a full vault or full character inventory appear in the
transfer dialog. Inventory refreshes after every attempted transfer.

`npm test` checks transfer planning, partial failures, hover-data extraction, and
the overlay shortcut. `npm run test:inventory` tests the layout, hover positioning,
and transfer UI with fixture data; it does not move actual account items.
