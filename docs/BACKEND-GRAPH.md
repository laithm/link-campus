# Backend graph

Open **Settings → Visualise backend** at `/settings/backend` to inspect the
database graph. Connected mode calls authenticated `GET /api/network/graph`
using the existing session cookie. The endpoint is read-only, does not call
Ollama, and returns `Cache-Control: private, no-store`.

The contract is exported from `src/types.ts` and `web/src/types/api.ts`:

```ts
type BackendGraphNode = {
  id: string;       // actor:<UUID>, concept:<UUID>, or context:<UUID>
  entityId: string; // original database UUID
  kind: "person" | "club" | "lab" | "department" | "company" | "concept" | "context";
  label: string;
  subtype?: string; // context.kind: course, event, paper, project, grant, team
  areaId?: string;  // actor:<UUID> for a visible home unit
};

type BackendGraphEdge = {
  id: string;
  source: string; // namespaced node ID
  target: string;
  kind: string;
  label: string;
};

type BackendGraphResponse = {
  nodes: BackendGraphNode[];
  edges: BackendGraphEdge[];
  generatedAt: string;
};
```

## What the projection contains

All discoverable actors are included. Concepts come from their complete,
resolved, nonprivate memberships; duplicate aliases produce one actor–concept
edge. Activities are `context` records reached by a nonprivate edge from a
discoverable actor. Hidden actors, private memberships, private edges, and
dangling endpoints are excluded. Hidden home units are not exposed through
`areaId`. Concepts have no invented department assignment.

The graph includes these stored relationships:

| Edge ID prefix | `kind` | Database source |
| --- | --- | --- |
| `membership:` | `interest` | Distinct visible `actor_concept` pairs |
| `home:` | `home_unit` | An actor's visible `home_unit` foreign key |
| `edge:` | `member_of`, `enrolled_in`, `attended`, `authored`, etc. | Visible actor→actor or actor→context rows in `edge` |
| `relation:` | `broader`, `related` | `concept_relation` rows whose two concept nodes are already visible |

Historical relationships remain visible. When an edge's `valid_to` is in the
past, its display label starts with `Past:`; the original relation kind remains
unchanged. A shared interest or course is not a claim that two people have
introduced themselves or exchanged messages. The graph does not invent
person-to-person edges from shared interests.

Contacts, concept definitions, raw interest text, edge evidence, messages,
workspace contents, and documents are absent from this response. One SQL
statement reads the entire projection from a consistent database snapshot;
there is no suggestion cap or per-node query. `generatedAt` identifies when the
response was produced; refresh requests a new snapshot.

This hackathon explorer is intentionally available to **every authenticated
demo user**, with the same discoverability and visibility filtering. It has no
administrator role gate. A production-only operations view would need an
explicit role check in the API and UI; placing this page under Settings does not
create such a restriction.

## Sample and connected modes

Connected mode reads the running backend. Standalone preview mode lazily loads
`web/src/home/backend-snapshot.json`, an explicit export of the repository's
synthetic seed graph. The UI identifies it as **Sample database**. API failures
do not silently switch a connected session to the sample.

The verified seed snapshot contains 1,083 nodes and 5,130 edges: 291 people,
25 communities, 706 interests, and 61 activities. A live graph can change as
database records or visibility settings change. The public website's sample
cannot access a backend running on a visitor's computer.

Regenerate the sample from the isolated local seed database, from the repo root:

```sh
DATABASE_URL=postgresql://link_local@127.0.0.1:55432/link_campus \
  node --import tsx scripts/export-backend-preview.ts --seed-only
```

The exporter checks every node's ID, label, kind, and home unit against the
checked-in seed's `actor`, `concept`, and `context` COPY data. It checks
memberships and all relationship IDs/endpoints against `actor_concept`, `edge`,
and `concept_relation`. Added or changed records, dangling endpoints, and extra
contact/evidence fields stop the export before the file is written. This is
separate from the directory's `export-network-preview.ts`.

## Verified backend checks

```sh
TEST_DATABASE_URL=postgresql://link_local@127.0.0.1:55432/link_campus \
  node --import tsx --test tests/backend-graph.integration.test.ts tests/backend-preview-export.test.ts
```

The database test rolls back its records. It verifies HTTP authentication,
actual actor/activity/concept relationships, hidden/private exclusions,
historical labels, duplicate memberships, UUID namespace collisions, valid
endpoints, and the absence of raw/private fields. The exporter regression also
checks rejection of local additions, changed seed records, and unexpected
fields. These tests cover the API and export path; interface checks are recorded
in [PREVIEW-QA.md](PREVIEW-QA.md).
