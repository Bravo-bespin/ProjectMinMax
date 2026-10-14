# Project Min-Max

## Install Electron and Bungie Auth dependencies

This repository does not include `node_modules`. After cloning, install the
Electron version used by the project with Node.js 22.12 or later:

```bash
npm init -y
npm install --save-dev electron@44.7.2
npm install --save bungie-auth
```

Verify the installation:

```bash
npx electron --version
npx bungie-auth --version
```

The command should report `v44.7.2`.
