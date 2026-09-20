# Link — your campus, connected

**[Open the live demo](https://link-campus.vercel.app/)** · [GitHub repository](https://github.com/laithm/link-campus)

A campus discovery app that connects people through shared interests and explains why each match matters. Turn the labelled interest sphere to filter a focused Three.js network: at most 12 matching people, with nearby names visible and distant labels fading away. The responsive workspace also includes searchable connections, locally saved profiles, and a complete preview introduction flow.

Based on [Prashant-koi/link](https://github.com/Prashant-koi/link). The original backend is retained, with a new authenticated atlas endpoint that filters and ranks people from complete interest memberships.

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

1. Turn the interest sphere on the left, click a label, or use its arrows.
2. Watch the network and top profiles update together; drag the network to bring distant names forward.
3. Read the evidence in **Why you two connect**.
4. Save a profile or write a local demo connection request.
5. Open **Collaborations** to see your saved request.

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

## Hand-off

The entire repository can be cloned or downloaded from GitHub. Your brother only needs the `web` install and preview commands above to run the frontend. Keep `.env` files with real credentials, local `node_modules`, and build output out of Git. `.env.demo` is intentionally public and contains only the preview-mode flag.
