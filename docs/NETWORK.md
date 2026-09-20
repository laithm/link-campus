# Network directory API

`GET /api/network` is an authenticated, read-only directory for exploring the
people, communities, areas, and interest memberships stored in Link's database.
It uses the existing session cookie and returns 401 without a valid session.
It does not call Ollama or depend on model availability.

```ts
type NetworkActor = ActorSummary & {
  concepts: { conceptId: string; label: string }[];
};

type NetworkDirectoryResponse = {
  actors: NetworkActor[];
  areas: { id: string; name: string; count: number }[];
  concepts: { id: string; label: string; count: number }[];
  totals: {
    people: number;
    communities: number;
    areas: number;
    concepts: number;
    memberships: number;
  };
  generatedAt: string;
};
```

The endpoint returns every discoverable actor, including people, clubs, labs,
departments, and companies. There is no suggestions limit or silent truncation.
Actors with no interests remain in the directory. Hidden profiles are excluded,
including the current viewer if their own profile is hidden. This is a visible
directory, not an administrative database export.

Each actor's `concepts` contains their complete resolved, nonprivate canonical
interests. Duplicate aliases for one actor and concept count once. Unresolved
and private memberships are excluded. The familiar `topConcepts` field remains
capped at five for existing profile components; directory filtering and links
must use `concepts`. Newly resolved concepts are included even before the IDF
materialized view refreshes; missing rarity values use zero.

Contact methods apply the existing nonprivate visibility rules. A private
contact does not appear in the response. Home units reference only discoverable
actors, so a hidden department's ID and name are not disclosed through a member.
Actors without a visible home unit have no `homeUnit` and belong to the explicit
area `{ id: "unassigned", name: "Unassigned" }`.

All aggregates describe exactly the returned actor universe:

- An area's `count` counts actors assigned to that area, including communities.
  Areas are derived from actors' visible `homeUnit`; there is no guessed area
  assignment. Area counts sum to the number of actors.
- A concept's `count` counts distinct actors with that visible concept.
  Unused concepts and concepts present only on hidden/private memberships do
  not appear in the concept list.
- `people` counts actors of kind `person`; `communities` counts all other kinds.
- `areas` includes the Unassigned bucket when needed. `concepts` is the number
  of concepts in the returned list. `memberships` counts visible actor–concept
  pairs, independent of the five profile chips.
- `generatedAt` is an ISO timestamp for the returned snapshot. It does not
  imply live subscriptions or background refreshes.

The directory uses one SQL statement with batched actor, membership, and contact
reads, so every response comes from a consistent database snapshot without
per-actor queries. Responses send `Cache-Control: private, no-store`.

Matching a shared interest is evidence of a shared interest, not proof that two
people know each other. Directory visualizations should distinguish these
memberships from introductions, messages, workspace membership, and actual
relationships; the endpoint does not claim or expose those records.

The regression test uses a migrated local PostgreSQL database and rolls back
its test records:

```sh
TEST_DATABASE_URL=postgresql://link_local@127.0.0.1:55432/link_campus \
  node --import tsx --test tests/network.integration.test.ts
```

It verifies complete membership beyond five chips, more than 200 directory
actors, duplicate aliases, unresolved/new concepts, private contacts and
interests, hidden profiles and home units, exact aggregate counts, batched
reads, and real HTTP session authentication.

## Standalone preview

The `/network` page is also available in the shared preview. It dynamically loads
`web/src/home/network-snapshot.json`, an export of the repository's synthetic
seed database. This contains the full discoverable directory, rather than the
smaller matching fixtures used on the discovery page. Contact methods are
omitted from this public snapshot; each profile still has its own shareable
`/network?person=<id>` link. The page labels the snapshot explicitly.

Regenerate only from the synthetic seed database:

```sh
DATABASE_URL=postgresql://link_local@127.0.0.1:55432/link_campus \
  node --import tsx scripts/export-network-preview.ts --seed-only
```

The exporter rejects actors whose IDs/names do not match the checked-in seed.
It is not a mechanism for publishing a production directory. Connected mode
always reads the authenticated API and never silently switches to the snapshot.
