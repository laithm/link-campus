import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

/** Run against a migrated local database; every test row is rolled back. */
test("atlas filters full graph membership, preserves rank, and respects visibility", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a migrated local Postgres database",
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { pool } = await import("../src/db.js");
  const { getAtlas } = await import("../src/services/atlas.js");
  const client = await pool.connect();
  await client.query("BEGIN");
  // The production pool may serve parallel reads; one rollback transaction
  // has one connection, so serialize them in this test harness.
  let pending: Promise<unknown> = Promise.resolve();
  const queryMock = t.mock.method(pool, "query", ((...args: Parameters<typeof pool.query>) => {
    const result = pending.then(() => client.query(...args));
    pending = result.catch(() => undefined);
    return result;
  }) as typeof pool.query);
  try {
    const viewer = randomUUID();
    const best = randomUUID();
    const distant = randomUUID();
    const hidden = randomUUID();
    const privatePerson = randomUUID();
    const lab = randomUUID();
    const peers = Array.from({ length: 12 }, () => randomUUID());
    const concepts = Array.from({ length: 10 }, () => randomUUID());
    const [common, ...rest] = concepts;
    const rare = rest.slice(0, 6);
    const empty = concepts[7];
    const privateConcept = concepts[8];
    const lowRankConcept = concepts[9];

    for (const id of [viewer, best, distant, hidden, privatePerson, lab, ...peers]) {
      await client.query(
        `INSERT INTO actor (id, kind, display_name, discoverable)
         VALUES ($1, $2, 'Atlas integration test', $3)`,
        [id, id === lab ? "lab" : "person", id !== hidden],
      );
    }
    for (const [index, id] of concepts.entries()) {
      await client.query(`INSERT INTO concept (id, pref_label, definition) VALUES ($1, $2, 'Test')`, [id, `Atlas concept ${index}`]);
    }
    async function interest(actorId: string, conceptId: string | null, visibility = "institution", strength = 1) {
      await client.query(
        `INSERT INTO actor_concept (actor_id, concept_id, raw_text, visibility, strength, resolved_at)
         VALUES ($1, $2, 'raw alias', $3, $4, now())`,
        [actorId, conceptId, visibility, strength],
      );
    }
    for (const id of concepts) await interest(viewer, id, id === privateConcept ? "private" : "institution");
    await interest(viewer, null);
    for (const id of [best, distant, hidden, lab, ...peers]) await interest(id, common, "institution", id === distant ? 0.01 : 1);
    await interest(best, common); // Duplicate aliases must not inflate counts.
    await interest(privatePerson, common, "private");
    for (const id of rare) await interest(best, id);
    await interest(distant, lowRankConcept, "institution", 0.001);
    await interest(distant, privateConcept);
    await client.query("REFRESH MATERIALIZED VIEW concept_idf");

    const atlas = await getAtlas(viewer);
    assert.equal(atlas.suggestions.length, 12);
    assert.equal(atlas.total, 14);
    assert.equal(atlas.interests.length, 9, "unresolved and private interests are absent");
    assert.equal(atlas.interests.find((interest) => interest.conceptId === common)?.count, 14);
    assert.equal(atlas.interests.find((interest) => interest.conceptId === empty)?.count, 0);
    assert(!atlas.interests.some((interest) => interest.label === "raw alias"), "labels are canonical");
    assert(!atlas.suggestions.some((suggestion) => [hidden, privatePerson, lab, distant].includes(suggestion.actor.id)));
    assert.equal(atlas.suggestions[0].actor.id, best);
    assert(atlas.suggestions.every((suggestion, index) => index === 0 || atlas.suggestions[index - 1].score >= suggestion.score));
    const bestMatch = atlas.suggestions.find((suggestion) => suggestion.actor.id === best)!;
    assert.equal(bestMatch.sharedConceptIds.length, 7);
    assert(bestMatch.sharedConceptIds.includes(common));
    assert(!bestMatch.actor.topConcepts.some((concept) => concept.conceptId === common), "membership exceeds the top-five profile chips");

    const filtered = await getAtlas(viewer, common, 1);
    assert.equal(filtered.total, 14);
    assert.equal(filtered.suggestions.length, 1);
    assert.deepEqual(filtered.interests, atlas.interests, "sphere counts remain stable while filtering");
    assert.equal(filtered.suggestions[0].reasons[0].evidence[0].id, common, "selected interest remains visible outside top-three reasons");

    const outsideFirstPage = await getAtlas(viewer, lowRankConcept);
    assert.equal(outsideFirstPage.total, 1);
    assert.equal(outsideFirstPage.suggestions[0].actor.id, distant, "filtering happens before display limiting");
    assert(!outsideFirstPage.suggestions[0].sharedConceptIds.includes(privateConcept));
    assert.equal((await getAtlas(viewer, privateConcept)).total, 0);
    assert.equal((await getAtlas(viewer, randomUUID())).total, 0);
    assert.equal((await getAtlas(viewer, empty)).total, 0);

    const { createServer } = await import("../src/api/server.js");
    const { createSession, sessionCookieHeader } = await import("../src/auth/session.js");
    const cookie = sessionCookieHeader(await createSession(viewer)).split(";")[0];
    const server = createServer().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      assert(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/api/actors`;
      assert.equal((await fetch(`${url}/me/atlas`)).status, 401);
      assert.equal((await fetch(`${url}/${best}/atlas`, { headers: { cookie } })).status, 403);
      for (const query of ["conceptId=bad", "limit=0", "limit=-1", "limit=1.5", "limit=abc", "limit=1&limit=2"]) {
        assert.equal((await fetch(`${url}/me/atlas?${query}`, { headers: { cookie } })).status, 400);
      }
      const response = await fetch(`${url}/me/atlas?conceptId=${lowRankConcept}&limit=1`, { headers: { cookie } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.total, 1);
      assert.equal(body.suggestions[0].actor.id, distant);

      const foreignInterest = (await client.query("SELECT id FROM actor_concept WHERE actor_id = $1 LIMIT 1", [distant])).rows[0].id;
      const ownInterest = (await client.query("SELECT id FROM actor_concept WHERE actor_id = $1 AND concept_id = $2", [viewer, lowRankConcept])).rows[0].id;
      const patch = (id: string) => fetch(`${url}/me/interests/${id}`, {
        method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ visibility: "private" }),
      });
      assert.equal((await patch(foreignInterest)).status, 404, "a known foreign interest ID cannot be modified");
      assert.equal((await client.query("SELECT visibility FROM actor_concept WHERE id = $1", [foreignInterest])).rows[0].visibility, "institution");
      assert.equal((await patch(randomUUID())).status, 404, "foreign and nonexistent IDs have the same response");
      assert.equal((await patch("malformed")).status, 400);
      assert.equal((await patch(ownInterest)).status, 200);
      const afterPrivacy = await getAtlas(viewer);
      assert(!afterPrivacy.interests.some((interest) => interest.conceptId === lowRankConcept));
      assert(afterPrivacy.suggestions.every((suggestion) =>
        !suggestion.sharedConceptIds.includes(lowRankConcept) &&
        !suggestion.reasons.some((reason) => reason.evidence.some((evidence) => evidence.id === lowRankConcept)),
      ));
      assert.equal((await getAtlas(viewer, lowRankConcept)).total, 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    queryMock.mock.restore();
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
