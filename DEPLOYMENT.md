# Deploying on Render

Use the existing Static Site for the browser build and a single Node Web Service for the game server. Select the same repository and branch for both, and leave Root Directory blank so npm can resolve the workspaces.

| Setting | Static Site | Web Service |
|---|---|---|
| Build Command | `npm ci --include=dev && npm run build -w @baan/shared && npm run build -w @baan/client` | `npm ci --include=dev && npm run build -w @baan/shared && npm run build -w @baan/server` |
| Publish Directory | `packages/client/dist` | — |
| Start Command | — | `npm start` |
| Health Check Path | — | `/healthz` |

Use Node 24.x for both services. Leave the Render-assigned server `PORT` in place. The server binds to `0.0.0.0`.

Set these environment variables in Render, using the actual public origins with no trailing slash, paths, or query strings:

| Service | Key | Value |
|---|---|---|
| Static Site | `VITE_SERVER_URL` | `https://trust-me-it-s-ghosts.onrender.com` |
| Web Service | `CLIENT_ORIGIN` | `https://trust-me-it-s-ghosts-s.onrender.com` |
| Web Service | `NODE_ENV` | `production` |

If either service has a different URL, update the matching variable. The client URL is embedded at build time, so rebuild the Static Site after changing it. Restart or redeploy the Web Service after changing its origin. For a new pair of services, deploy the Static Site once you have the Web Service URL, then set the actual Static Site origin and start the Web Service. The game is opened from the Static Site URL.

Socket.IO uses HTTP polling and can upgrade to WebSocket on the same public HTTPS origin and port, using the default `/socket.io/` path. CORS and the initial handshake check the configured browser origin. Clients without an Origin header are allowed. An origin check is not authentication.

Before releasing, build the client with its production URL, run `npm run typecheck`, then run these checks from the repository root:

```sh
npx tsx --test packages/server/tests/*.test.ts packages/client/tests/*.test.ts
node --test tests/smoke/production-smoke.test.mjs
```

After deployment, open the server's `/healthz` and check for `{"ok":true}`. Open the game in two browser sessions on different networks, create and join a room, ready up, perform an action and reload one client to resume. This verifies the real TLS and proxy path in addition to the local smoke test.

## Limitations

- Started story rooms and resume tokens are saved to `packages/server/saves` by default. Set `CASE_SAVE_DIR` to a private persistent disk path on the Web Service to survive redeploys or instance replacement. Keep one server instance. An empty `CASE_SAVE_DIR` disables disk saves; then rooms survive only while that process stays alive. Unstarted rooms remain in memory.
- Free web services can sleep after inactivity. The first online connection may need time to wake the service. Check the [Render free-tier limits](https://render.com/docs/free).
- The Web Service exposes public room operations. Room codes and resume tokens are not accounts. Share room codes only with intended players. The server does not currently have public-facing rate limits.
- The local smoke test verifies transports and room behavior, while a browser check after deploy is needed to verify the deployed TLS/proxy and client asset configuration.


## Current release checks

Use `CASE_STORY_VERSION=4.3` (or leave it unset) for guided scenes. The DM can pause, resume, rewind to the start of the current chapter, or withdraw and calculate an ending from the actual state. Rewind pauses the restored room and requires unchanged room membership and DM; resume after reviewing it. Rewind is unavailable after closing the case.

The default basic mode uses 2 damage on a successful player attack and caps enemy HP scaling at four investigators to reduce crowding penalties for six-player teams. Advanced mode retains its previous damage and scaling.

Local browser verification: `node scripts/browser-playtest.mjs 2` and `node scripts/browser-playtest.mjs 6`. Requires Chrome on Windows; starts local ports 39201, 5179 and 9237 and saves evidence under `artifacts`. Combat policy simulations: `node --import tsx scripts/combat-balance.mts`. Simulations use fixed seeds and a simple movement/attack policy for C/D and objective/ritual policy for E. They do not replace human playtesting.
