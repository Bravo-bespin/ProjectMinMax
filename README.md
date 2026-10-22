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
Aegis comparison. Details load on demand and remain cached across refreshes until the item changes.
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

## Loading performance

Equipped gear appears first, followed by carried gear, then the vault. Vault requests run in the
background and interactive hover requests take priority. Public item definitions
are cached in the app’s user-data directory for 24 hours; Aegis recommendations
are cached for six hours and load separately from item stats and perks.
Credentials and profile inventories are not written to these caches.

Unchanged inventory refreshes preserve the current view, search field, and loaded
vault pages. The vault renders 60 items at a time; **Load more** adds the next 60.
Hover panels are created only when opened, and gear images load lazily.

## Desktop launcher (macOS)

Double-click `Project MinMax.app` on your Desktop to launch this checkout without
Terminal. It uses the project’s existing Electron install and `.env` settings.
Keep the project folder at its current location. If you move it, recreate the
launcher after removing or renaming the old one:

```bash
python3 scripts/create-desktop-launcher.py
```

Launcher output is saved to `~/Library/Logs/Project MinMax/launcher.log`.

## Gear tiers and hover comparisons

Item tiles and hover cards show Destiny 2’s **Gear Tier 1–5** when Bungie provides
`gearTier` for that specific item. Rarity (Legendary, Exotic, etc.) remains a
separate label. Items without a gear tier do not receive an invented tier.
Gold borders and a diamond mark masterworked items; enhanced traits have gold
icon outlines and an Enhanced marker. The hover card also shows the installed
masterwork stat plug when present.

Perk 1 and Perk 2 use the equipped plug in each original socket column, including
Bungie’s `frames` trait category. Intrinsic frames, origin traits and trackers do
not consume those columns. Comparison rows show your installed perk plus Aegis’s
listed alternatives. Enhanced traits match their normal names for Aegis scoring.

`npm run test:mint` checks a Bungie-valid Mint Retrograde sample roll against the
live Aegis **Other** tab, verifies that its plugs belong to the public perk pools,
and prints the per-column matches. It uses the configured API key for public
manifest reads; it does not read or change owned inventory. The sample is Volatile
Launch / Appended Mag / Beacon Rounds / Chain Reaction. The Other tab is included
in the app’s sources, and launcher `tubes` plugs count as barrel options.

The panel stays visible when you click another app or the desktop, and when the
game loses focus or closes. Only **Clear overlay** makes it invisible; double-M
restores it. Native game-window tracking supplies geometry without controlling
visibility. `npm run test:lifecycle` checks focus loss, safe close cleanup, and
late native tracker callbacks after the window is destroyed.

On macOS, the top-left native traffic-light buttons close, minimize, and expand
or enter fullscreen. They hide when the overlay is cleared and return with
double-M. The header remains draggable beneath the native window controls.

Hover cards display the Aegis spreadsheet’s letter rating (S/A/B/C/D/F) near the
weapon name, independently of the 0–4 roll-match count and Destiny gear tier.
Archetype/intrinsic frames do not get enhanced-trait gold markers or appear as
masterwork plugs.

Weapon stat bars show verified masterwork and gear-tier contributions as two gold
segments, with gold totals. Hover a stat for the base/masterwork/tier breakdown.
Calculations use investment stats and Bungie’s stat-group interpolation, including
caps and supported full-masterwork tier bonuses. If a reported total conflicts
with the modeled contributions, or scaling data is unavailable, the app keeps
Bungie’s total and omits an unverified gold split.

The rating badge displays only its letter (S/A/B/C/D/F). On macOS, a fixed black
title bar stays behind the native controls while the inventory scrolls; hover
cards remain below it. Enhanced barrels, magazines, and origin traits receive
the same gold icon outlines and Enhanced marker as enhanced gameplay traits,
using each plug’s own metadata. Archetype frames remain unmarked.
