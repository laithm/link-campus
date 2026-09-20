# Interest atlas backend

The sphere and people map use `api.getAtlas(conceptId?, limit?, signal?)`. The
connected client calls the authenticated, same-origin endpoint:

```http
GET /api/actors/me/atlas?conceptId=<canonical UUID>&limit=12
```

The response is `AtlasResponse` in `src/types.ts` and `web/src/types/api.ts`:

```ts
{
  interests: { conceptId: string; label: string; count: number }[];
  suggestions: (ConnectionSuggestion & { sharedConceptIds: string[] })[];
  total: number;
}
```

- Interests are the viewer's complete resolved, nonprivate canonical interests,
  including interests with no current matches. Unresolved entries remain in
  Settings until the resolution worker assigns a concept.
- Suggestions contain discoverable people with at least one exact shared
  interest. Private interests, hidden profiles, labs, and context-only matches
  do not become people nodes.
- Matching uses the full `actor_concept` graph, independently of the five
  profile chips and three displayed reasons. `sharedConceptIds` is the complete
  visible intersection and grounds the map's connections.
- Existing backend scoring ranks results. A selected interest filters the
  ranked set **before** limiting it; its evidence is included in the displayed
  reasons. The default limit is 12 and the maximum is 24.
- Each interest's `count` is the number of matching ranked people before the
  display limit. `total` is the count for the current filter. Counts remain
  stable while switching interests.
- Session identity is authoritative. Missing sessions receive 401; requesting
  another actor's atlas receives 403; malformed filters/limits receive 400.
  An unknown or unshared well-formed concept returns zero matches.

Fixture mode implements the same response contract inside the API client.
The UI does not infer real graph membership from fixture IDs or profile chips.
The connected path never falls back silently to fixtures if the backend fails.

## Running the connected local preview

This development machine has an isolated PostgreSQL 17 + pgvector database on
`127.0.0.1:55432`, separate from any other local database. All 11 migrations and
the repository's data snapshot are loaded (325 actors). Name-derived demo
credentials were generated for the 300 seeded people, because the snapshot
does not contain credentials.

Runtime files are outside the repository:

```text
~/.local/share/link-campus-runtime/postgres/    database files
~/.local/share/link-campus-runtime/api.env      private local API configuration
~/.local/share/link-campus-runtime/workspaces/  uploaded workspace files
```

The API configuration contains a generated session secret; it must remain local.
Start the existing database if it is stopped, then run the API from the repo root:

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl \
  -D "$HOME/.local/share/link-campus-runtime/postgres" \
  -l "$HOME/.local/share/link-campus-runtime/postgres.log" \
  -o "-h 127.0.0.1 -p 55432 -k $HOME/.local/share/link-campus-runtime" start

DOTENV_CONFIG_PATH="$HOME/.local/share/link-campus-runtime/api.env" npm run dev:api
```

The API listens on `http://127.0.0.1:3001`. For a connected frontend, run from
`web/` without the demo mode flag:

```sh
API_PROXY_TARGET=http://127.0.0.1:3001 npm run dev -- --host 127.0.0.1 --port 5174
```

Open `http://127.0.0.1:5174` and use the seeded demo account
`nina.farouk` / `nina@farouk`. Do not append `?fixtures=1`.

For this account, the verified connected atlas returns nine interests, 173
ranked people, and twelve visible suggestions. These are generated seed
profiles stored in PostgreSQL, not real students. Authentication and atlas
queries are served by the real Express API. Ollama is not installed in this
local runtime: existing graph reads and cached/template explanations work;
model-dependent imports, resolution, and AI generation require the configured
model runtime and workers.

## Verification

From the repository root:

```sh
npm run typecheck
TEST_DATABASE_URL=postgresql://link_local@127.0.0.1:55432/link_campus \
  node --import tsx --test tests/atlas*.test.ts
```

The integration test requires a migrated local database. It creates isolated
records inside a transaction and rolls them back. It exercises exact membership
beyond the top five chips, interest evidence beyond the top three reasons,
filtering beyond the first twelve results, deduplicated counts, stable sphere
counts, private/hidden/group exclusion, empty results, and HTTP authentication,
authorization, and input validation. It also verifies that a person cannot
change another person's interest visibility, and that hiding their own interest
removes it from atlas membership and explanations. The fixture-client regression
checks the same privacy behavior. The database test skips with an explicit
message when `TEST_DATABASE_URL` is absent; the fixture test still runs.

## Sharing a connected deployment

The existing Docker stack builds the frontend into the Express API image, so
`/api` and `/collab` use the same origin and session cookies work without CORS
changes. Use the repository's existing deployment instructions, real generated
secrets, database volume, and model/worker configuration to run that stack.

The backend for this remake runs locally. `linkmit.duckdns.org` identifies the
original website, not a separate backend deployment for this preview. The shared
Vercel website remains a clearly identified sample-data preview; the connected
local version uses the API and PostgreSQL described above.
A static frontend deployment alone does not publish this PostgreSQL-backed API.
For a split deployment, preserve same-origin `/api` and `/collab` routing and
session cookies; remove `VITE_FIXTURES=1` and the demo build mode after the live
backend has been deployed and verified.
