import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("backend graph includes stored relationships and activities without hidden endpoints or private data", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a migrated local Postgres database",
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { pool } = await import("../src/db.js");
  const { getBackendGraph } = await import("../src/services/backendGraph.js");
  const client = await pool.connect();
  await client.query("BEGIN");
  let pending: Promise<unknown> = Promise.resolve();
  let queryCount = 0;
  const queryMock = t.mock.method(pool, "query", ((...args: Parameters<typeof pool.query>) => {
    queryCount++;
    const result = pending.then(() => client.query(...args));
    pending = result.catch(() => undefined);
    return result;
  }) as typeof pool.query);
  try {
    const area = randomUUID(), hiddenArea = randomUUID(), person = randomUUID();
    const club = randomUUID(), hidden = randomUUID(), privateAreaMember = randomUUID();
    const sharedConcept = randomUUID(), privateConcept = randomUUID(), hiddenConcept = randomUUID();
    // Identical entity UUIDs across tables must remain three distinct nodes.
    const concept = person, course = person;
    const privateActivity = randomUUID(), hiddenActivity = randomUUID(), orphanActivity = randomUUID();
    const secret = `Never export ${randomUUID()}`;

    for (const [id, kind, visible, home] of [
      [area, "department", true, null], [hiddenArea, "department", false, null],
      [person, "person", true, area], [club, "club", true, null],
      [hidden, "person", false, null], [privateAreaMember, "person", true, hiddenArea],
    ] as const) {
      await client.query(
        "INSERT INTO actor (id,kind,display_name,discoverable,home_unit) VALUES ($1,$2,$3,$4,$5)",
        [id, kind, `Graph test ${id}`, visible, home],
      );
    }
    for (const id of [concept, sharedConcept, privateConcept, hiddenConcept]) {
      await client.query("INSERT INTO concept (id,pref_label,definition) VALUES ($1,$2,$3)", [id, `Topic ${id}`, secret]);
    }
    for (const [id, kind] of [[course, "course"], [privateActivity, "event"], [hiddenActivity, "project"], [orphanActivity, "paper"]]) {
      await client.query("INSERT INTO context (id,kind,title) VALUES ($1,$2,$3)", [id, kind, `Activity ${id}`]);
    }
    for (const [actorId, conceptId, visibility] of [
      [person, concept, "public"], [person, concept, "institution"],
      [person, sharedConcept, "institution"], [club, sharedConcept, "public"],
      [person, privateConcept, "private"], [hidden, hiddenConcept, "public"],
      [person, null, "public"],
    ]) {
      await client.query(
        "INSERT INTO actor_concept (actor_id,concept_id,raw_text,visibility) VALUES ($1,$2,$3,$4)",
        [actorId, conceptId, secret, visibility],
      );
    }
    async function edge(source: string, target: string, targetType: string, relation: string, visibility = "institution", past = false) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO edge (id,src_id,src_type,dst_id,dst_type,relation,visibility,evidence,valid_to)
         VALUES ($1,$2,'actor',$3,$4,$5,$6,$7,$8)`,
        [id, source, target, targetType, relation, visibility, { privateText: secret }, past ? "2020-01-01" : null],
      );
      return `edge:${id}`;
    }
    const enrollment = await edge(person, course, "context", "enrolled_in", "institution", true);
    const attendance = await edge(club, course, "context", "attended");
    const membership = await edge(person, club, "actor", "member_of");
    const excluded = [
      await edge(person, privateActivity, "context", "attended", "private"),
      await edge(hidden, hiddenActivity, "context", "authored"),
      await edge(person, hidden, "actor", "advises"),
      await edge(hidden, person, "actor", "advises"),
      await edge(person, club, "actor", "affiliated_with", "private"),
      await edge(person, randomUUID(), "context", "attended"),
    ];
    const relation = randomUUID(), privateRelation = randomUUID();
    await client.query(
      "INSERT INTO concept_relation (id,src_id,dst_id,kind) VALUES ($1,$2,$3,'related'),($4,$2,$5,'broader')",
      [relation, concept, sharedConcept, privateRelation, privateConcept],
    );
    await client.query(
      "INSERT INTO actor_contact_method (actor_id,kind,value,visibility) VALUES ($1,'email',$2,'public')",
      [person, secret],
    );

    queryCount = 0;
    const graph = await getBackendGraph();
    assert(queryCount <= 4, "graph reads are batched rather than per entity");
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
    assert.equal(nodes.size, graph.nodes.length);
    assert.equal(edges.size, graph.edges.length);
    assert(nodes.has(`actor:${person}`) && nodes.has(`concept:${person}`) && nodes.has(`context:${person}`));
    assert.equal(nodes.get(`context:${course}`)?.subtype, "course");
    assert.equal(nodes.get(`actor:${person}`)?.areaId, `actor:${area}`);
    assert.equal(nodes.get(`actor:${privateAreaMember}`)?.areaId, undefined);
    assert.equal(nodes.get(`concept:${concept}`)?.areaId, undefined);
    assert(nodes.has(`actor:${club}`));
    assert(edges.has(enrollment) && edges.has(attendance) && edges.has(membership));
    assert.equal(edges.get(enrollment)?.target, `context:${course}`);
    assert.equal(edges.get(enrollment)?.kind, "enrolled_in");
    assert.equal(edges.get(enrollment)?.label, "Past: enrolled in");
    assert(edges.has(`relation:${relation}`));
    assert(!edges.has(`relation:${privateRelation}`));
    assert(edges.has(`home:${person}`));
    assert(!edges.has(`home:${privateAreaMember}`));
    assert.equal(graph.edges.filter((edge) => edge.id === `membership:${person}:${concept}`).length, 1);
    for (const id of excluded) assert(!edges.has(id));
    for (const id of [`actor:${hidden}`, `actor:${hiddenArea}`, `concept:${privateConcept}`, `concept:${hiddenConcept}`,
      `context:${privateActivity}`, `context:${hiddenActivity}`, `context:${orphanActivity}`]) assert(!nodes.has(id));
    assert(graph.edges.every((edge) => nodes.has(edge.source) && nodes.has(edge.target)), "every edge has visible endpoints");
    assert(graph.nodes.every((node) => !node.areaId || nodes.has(node.areaId)));
    assert(!JSON.stringify(graph).includes(secret), "contacts, definitions, raw interests and evidence are absent");
    assert(Number.isFinite(Date.parse(graph.generatedAt)));

    const { createServer } = await import("../src/api/server.js");
    const { createSession, sessionCookieHeader } = await import("../src/auth/session.js");
    const cookie = sessionCookieHeader(await createSession(person)).split(";")[0];
    const server = createServer().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      assert(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/api/network/graph`;
      assert.equal((await fetch(url)).status, 401);
      const response = await fetch(url, { headers: { cookie } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const body = await response.json();
      assert.deepEqual(body.nodes, graph.nodes);
      assert.deepEqual(body.edges, graph.edges);
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
