import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("network directory returns everyone discoverable with complete, private-safe memberships", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a migrated local Postgres database",
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { pool } = await import("../src/db.js");
  const { getNetworkDirectory } = await import("../src/services/network.js");
  const client = await pool.connect();
  await client.query("BEGIN");
  let queryCount = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const queryMock = t.mock.method(pool, "query", ((...args: Parameters<typeof pool.query>) => {
    queryCount++;
    const result = pending.then(() => client.query(...args));
    pending = result.catch(() => undefined);
    return result;
  }) as typeof pool.query);

  try {
    const area = randomUUID();
    const hiddenArea = randomUUID();
    const person = randomUUID();
    const lab = randomUUID();
    const hidden = randomUUID();
    const unassigned = randomUUID();
    const hiddenAreaMember = randomUUID();
    const concepts = Array.from({ length: 7 }, () => randomUUID());
    const privateConcept = randomUUID();
    const hiddenOnlyConcept = randomUUID();
    const privateMarker = `Private ${randomUUID()}`;
    const hiddenMarker = `Hidden ${randomUUID()}`;
    const names = new Map([[hidden, hiddenMarker], [hiddenArea, hiddenMarker]]);
    for (const [id, kind, discoverable, homeUnit] of [
      [area, "department", true, null], [hiddenArea, "department", false, null],
      [person, "person", true, area], [lab, "lab", true, area],
      [hidden, "person", false, area], [unassigned, "person", true, null],
      [hiddenAreaMember, "person", true, hiddenArea],
    ] as const) {
      await client.query(
        `INSERT INTO actor (id, kind, display_name, discoverable, home_unit, has_account)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [id, kind, names.get(id) ?? `Directory test ${id}`, discoverable, homeUnit],
      );
    }
    // Exceed the existing suggestions endpoint's maximum: a directory must
    // not silently inherit that cap or omit actors without any interests.
    const additionalPeople = Array.from({ length: 205 }, () => randomUUID());
    await client.query(
      `INSERT INTO actor (id, kind, display_name, discoverable)
       SELECT id, 'person', 'Directory uncapped test', true FROM unnest($1::uuid[]) AS id`,
      [additionalPeople],
    );
    for (const id of [...concepts, privateConcept, hiddenOnlyConcept]) {
      await client.query(`INSERT INTO concept (id, pref_label, definition) VALUES ($1, $2, 'Directory test')`, [id, `Canonical ${id}`]);
    }
    async function interest(actorId: string, conceptId: string | null, visibility = "institution", rawText = "Visible alias") {
      await client.query(
        `INSERT INTO actor_concept (actor_id, concept_id, raw_text, visibility, resolved_at)
         VALUES ($1, $2, $3, $4, now())`, [actorId, conceptId, rawText, visibility],
      );
    }
    for (const id of concepts) await interest(person, id);
    await interest(person, concepts[0]); // Duplicate aliases count as one membership.
    await interest(person, concepts[0], "private", privateMarker);
    await interest(person, privateConcept, "private", privateMarker);
    await interest(person, null);
    await interest(lab, concepts[0], "public");
    await interest(hidden, concepts[0]);
    await interest(hidden, hiddenOnlyConcept);
    for (const [actorId, visibility, value] of [
      [person, "public", "directory@example.edu"],
      [person, "private", privateMarker],
      [hidden, "public", hiddenMarker],
    ]) {
      await client.query(
        `INSERT INTO actor_contact_method (actor_id, kind, value, visibility)
         VALUES ($1, 'email', $2, $3)`, [actorId, value, visibility],
      );
    }

    // No materialized-view refresh: new resolved concepts must appear even
    // before IDF catches up. Their rarity is safely represented as zero.
    queryCount = 0;
    const directory = await getNetworkDirectory();
    assert(queryCount <= 4, "reads are batched, independent of directory size");
    const expectedCount = Number((await client.query("SELECT count(*) AS count FROM actor WHERE discoverable = true")).rows[0].count);
    assert.equal(directory.actors.length, expectedCount);
    assert(directory.actors.length > 205);
    assert(additionalPeople.every((id) => directory.actors.some((actor) => actor.id === id)));
    assert(!directory.actors.some((actor) => actor.id === hidden || actor.id === hiddenArea));
    const entry = directory.actors.find((actor) => actor.id === person)!;
    assert.equal(entry.concepts.length, 7, "full membership is independent of the profile chip cap");
    assert.equal(entry.topConcepts.length, 5);
    assert(entry.topConcepts.every((concept) => concept.rarity === 0));
    assert(entry.concepts.every((concept) => concept.label.startsWith("Canonical ")));
    assert.deepEqual(entry.contact.methods, [{ kind: "email", value: "directory@example.edu" }]);
    assert.equal(entry.homeUnit?.id, area);
    assert.equal(directory.actors.find((actor) => actor.id === hiddenAreaMember)?.homeUnit, undefined);
    assert.equal(directory.actors.find((actor) => actor.id === unassigned)?.homeUnit, undefined);
    assert.equal(directory.areas.find((item) => item.id === area)?.count, 2);
    assert(directory.areas.some((item) => item.id === "unassigned"));
    assert.equal(directory.areas.reduce((count, item) => count + item.count, 0), directory.actors.length);
    assert.equal(directory.concepts.find((concept) => concept.id === concepts[0])?.count, 2);
    assert(!directory.concepts.some((concept) => [privateConcept, hiddenOnlyConcept].includes(concept.id)));
    assert.equal(directory.totals.people, directory.actors.filter((actor) => actor.kind === "person").length);
    assert.equal(directory.totals.communities, directory.actors.filter((actor) => actor.kind !== "person").length);
    assert.equal(directory.totals.areas, directory.areas.length);
    assert.equal(directory.totals.concepts, directory.concepts.length);
    assert.equal(directory.totals.memberships, directory.actors.reduce((count, actor) => count + actor.concepts.length, 0));
    assert.equal(directory.totals.memberships, directory.concepts.reduce((count, concept) => count + concept.count, 0));
    assert(Number.isFinite(Date.parse(directory.generatedAt)));
    const serialized = JSON.stringify(directory);
    assert(!serialized.includes(privateMarker));
    assert(!serialized.includes(hiddenMarker));
    assert(!serialized.includes(hiddenArea));

    const { createServer } = await import("../src/api/server.js");
    const { createSession, sessionCookieHeader } = await import("../src/auth/session.js");
    // Even a hidden signed-in viewer receives only the discoverable universe.
    const cookie = sessionCookieHeader(await createSession(hidden)).split(";")[0];
    const server = createServer().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      assert(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/api/network`;
      assert.equal((await fetch(url)).status, 401);
      const response = await fetch(url, { headers: { cookie } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const result = await response.json();
      assert.equal(result.actors.length, expectedCount);
      assert(!result.actors.some((actor: { id: string }) => actor.id === hidden));
      assert.deepEqual(result.totals, directory.totals);
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
