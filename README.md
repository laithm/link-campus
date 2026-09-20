# Link — your campus, connected

**[Visualise the backend](https://link-campus.vercel.app/settings/backend)** · [Database atlas](https://link-campus.vercel.app/network) · [Discovery](https://link-campus.vercel.app/) · [Public GitHub repository](https://github.com/laithm/link-campus)

A campus discovery app that connects people through shared interests and explains why each match matters. Turn the labelled interest sphere to filter a focused Three.js network: at most 12 matching people, with nearby names visible and distant labels fading away. The responsive workspace also includes searchable connections, locally saved profiles, and a complete preview introduction flow.

Based on [Prashant-koi/link](https://github.com/Prashant-koi/link). The original backend is retained, with a new authenticated atlas endpoint that filters and ranks people from complete interest memberships.

The **Database atlas** makes the complete visible database explorable: department-to-interest links, area sections, search, people/community filters, and a direct link for every profile. Connected mode reads the authenticated `/api/network` endpoint. The shared preview loads a synthetic seed snapshot containing 316 discoverable profiles and 706 interests. Its blue-grey paper, ink-blue navigation, cobalt controls, and custom LINK mark give the app the character of a campus research atlas.

**Settings → Visualise backend** opens a separate 3D map of the stored graph: larger people and group nodes, smaller interests and activities, and actual database relationships. Search for a node, follow its connections, isolate its neighborhood, filter by area or node type, and open its profile. Connected mode reads `/api/network/graph`; the standalone sample contains 1,083 validated synthetic nodes and 5,130 relationships. [Graph data and export documentation](docs/BACKEND-GRAPH.md)

## Run the local frontend preview

Requires a current Node.js LTS release and npm.

```sh
cd web
npm ci
npm run dev:demo
```

Open the local URL printed by Vite, usually **http://127.0.0.1:5173**.

The preview uses the repository's sample campus data and does not require PostgreSQL or Ollama. Demo connection requests, saved profiles, and settings remain in your browser. No real messages are sent. AI, imports, shared workspaces, and live replies require the backend; the preview explains this when those features are reached.

## Try the demo

1. Open **Settings → Visualise backend** and drag to orbit the 3D graph; scroll to zoom.
2. Search for a person, club, or topic. Select a node to inspect its stored relationships, then use **Isolate connections** or the area/type filters.
3. Follow a connected node, copy its link, or open an actor's profile in the Database atlas.
4. Return to **Discovery** and turn the interest sphere to update the matching people and top profiles together.
5. Read **Why you two connect**, save a profile, or write a local demo connection request.
6. Open **Collaborations** to see your saved request.

The atlas includes a no-WebGL fallback, reduced-motion support, zoom, and an expanded view. Graph positions are illustrative; the evidence panel gives the actual matching reasons.

## Build and backend mode

```sh
cd web
npm run typecheck
npm run build:demo
npm run preview -- --host 127.0.0.1
```

For the connected backend, use `npm run dev` or `npm run build` instead. Vite proxies `/api` and `/collab` to `http://localhost:3001` unless `API_PROXY_TARGET` is configured. The root backend requires its database/model configuration; see the source environment example and Docker Compose files. [Local backend setup and atlas API](docs/BACKEND-ATLAS.md) documents the running PostgreSQL-backed preview on port 5174 and its seeded login. The shareable Vercel link uses sample data; it cannot access a backend running on your computer.

More detail: [frontend README](web/README.md), [design and hackathon direction](docs/FRONTEND-DIRECTION.md), [preview verification](docs/PREVIEW-QA.md).

The [directory API and snapshot documentation](docs/NETWORK.md) explains visibility, complete membership data, aggregate counts, and regenerating the shareable seed preview.

## Hand-off

The entire repository can be cloned or downloaded from GitHub. Your brother only needs the `web` install and preview commands above to run the frontend. Keep `.env` files with real credentials, local `node_modules`, and build output out of Git. `.env.demo` is intentionally public and contains only the preview-mode flag.
