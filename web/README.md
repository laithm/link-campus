# Link web preview

Link helps people discover potential collaborators through interests and shared context. This frontend remake builds on [Prashant-koi/link](https://github.com/Prashant-koi/link), preserving its backend API contracts.

## Run the standalone preview

Use Node.js 20.19+ or 22.12+ and npm. From the repository root:

```sh
cd web
npm install
npm run dev:demo
```

Open the localhost URL printed by Vite. Keep the terminal running while you use the site. The preview signs in as the fictional sample viewer automatically; it needs no database, credentials, or AI model.

Search examples: `robotics`, `computer vision`, `AI`, `design`, and `cryptography`. Search matches the sample profiles' listed topics, names, and shared contexts using a fixed keyword/alias matcher. It does not run an AI model.

Interest settings, visibility preferences, and preview connection requests are saved in this browser's local storage. A preview request never sends a message to anyone. Requests stay pending because there is no other participant in the standalone preview. Clearing the site's browser storage resets these changes.

The people, communities, events, bridge suggestions, and completed imports in preview mode are sample data. Import processing, shared workspaces, live chat, collaborative editing, and AI summaries require the backend. These actions show an explanation in the preview instead of attempting an unavailable service. Added interests stay unresolved without the backend's concept resolution process.

## Use the real backend

Start the repository's backend services (including its database and model configuration), then run:

```sh
cd web
npm install
npm run dev
```

The development server proxies `/api` and the `/collab` WebSocket to `http://localhost:3001`. To use another backend address, set `API_PROXY_TARGET` in `web/.env.local`. Do not set `VITE_FIXTURES=1` or add `?fixtures=1` when testing real backend behavior.

```dotenv
API_PROXY_TARGET=http://localhost:3001
```

## Validate and build

```sh
npm run typecheck
npm run build
```

`npm run build` produces the backend-connected build. To build a standalone preview explicitly:

```sh
VITE_FIXTURES=1 npm run build
npm run preview
```

This is a project prototype and local design preview. No institutional affiliation, hackathon award, user adoption, or measured performance result is claimed.

## Share the hosted demo

The Vercel configuration builds the standalone demo and supports direct links to every app route. Deploy from `web` with `vercel --prod`, or choose `web` as the root directory when importing the GitHub repository. `vercel.json` intentionally selects `build:demo`; it does not deploy the backend.
