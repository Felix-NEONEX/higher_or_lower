# Higher or Lower - NEONEX Edition

Standalone multiplayer browser game for a one-time internal event.

## One-time deployment note

This architecture is intentionally optimized for a one-time internal event.

This repository is not a reference implementation.

This repository is not a platform pattern.

This repository is not to be copied into future production systems.

The service uses a single-process in-memory session on purpose because the event runs from one Railway instance, one process, and no persistence is required after a restart.

## Runtime

- Node.js + TypeScript single-service app
- Socket.IO shared multiplayer state
- Static client served by the same process
- Dockerfile at repo root to force Railway onto the intended runtime
- Health endpoint at `/health`

## Repo layout

- `server/`: authoritative game engine, question loading, HTTP and WebSocket bootstrap
- `client/`: minimal browser UI for live play and smoke testing
- `shared/`: contracts and shared types
- `data/higher_lower_top150.json`: only valid question source
- `scripts/smoke-test.ts`: automated multiplayer flow verification

## Local run

```bash
npm install
npm run build
npm run verify
npm run dev
```

Open `http://localhost:3000`.

## Railway deploy

Railway will use the root `Dockerfile`, which removes the old Python/Streamlit boot path entirely.

Required service settings:

- one service only
- one instance only
- no autoscaling
- public networking enabled

Deploy options:

```bash
railway up
```

or GitHub-connected auto-deploys from `main`.

## Operator notes

- Join from the lobby with first name only.
- Duplicate first names are blocked.
- Late joiners are queued and activated at the next round boundary.
- Exactly five rounds run per game.
- Each round belongs to one active player only.
- The active player has 15 seconds per challenge.
- If the active player is correct, the revealed right card stays on the board and the next challenger card is loaded automatically.
- If the active player reaches 7 correct answers in a row during one turn, the turn stops immediately with `Du Highperformer - lass auch mal andere ran!`.
- Questions are loaded from `data/higher_lower_top150.json` at boot and the service fails fast if the dataset is missing or invalid.
- The current dataset has 80 entries, and extending the JSON later does not require code changes as long as the schema stays the same.
- The loader accepts finite numeric values, including decimals and negative numbers, so the revised dataset shape is supported.
- Restart resets the in-memory session and creates a new five-question deck.
- If the process restarts, the live game resets. This is expected for this one-time event tool.
