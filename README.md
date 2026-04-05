# DeadTown P0 (GitHub Pages + Render)

This package is arranged so:

- `index.html` and `client-online.js` live in the repo root, so **GitHub Pages** can publish from `main / (root)` directly.
- `server/index.js` runs the **Render Web Service** backend for room sync and authoritative P0 match state.

## GitHub Pages

Set Pages to:

- **Branch:** `main`
- **Folder:** `/(root)`

## Render

Create a **Web Service** from this repo using:

- **Branch:** `main`
- **Root Directory:** *(leave blank)*
- **Build Command:** `npm install`
- **Start Command:** `npm start`

After Render deploys, copy the Render Web Service URL and convert it to WebSocket form:

- `https://your-service.onrender.com` -> `wss://your-service.onrender.com`

Paste that into the game's **WebSocket Server URL** field in Online Co-op, then connect.

## Included P0 sync scope

- shared rooms / ready / host start
- shared wave timer
- shared zombies and boss
- shared airdrops and pickups
- server-authoritative damage, kills, and drops

## Health check

Render health endpoint:

- `/health`
