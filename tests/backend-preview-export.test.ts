import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { assertSyntheticBackendGraph } from "../scripts/export-backend-preview.js";
import type { BackendGraphResponse } from "../src/types.js";

test("backend preview export refuses local additions, modified seed records, and private fields", async () => {
  const sql = await readFile(new URL("../db/seed-data/snapshot.sql", import.meta.url), "utf8");
  const graph: BackendGraphResponse = JSON.parse(await readFile(new URL("../web/src/home/backend-snapshot.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => assertSyntheticBackendGraph(graph, sql));
  for (const kind of ["person", "concept", "context"] as const) {
    const added = structuredClone(graph);
    const id = randomUUID();
    added.nodes.push({ id: `${kind === "person" ? "actor" : kind}:${id}`, entityId: id, kind, label: "Local-only data" });
    assert.throws(() => assertSyntheticBackendGraph(added, sql), /does not match the synthetic seed/);
    const changed = structuredClone(graph);
    changed.nodes.find((node) => node.kind === kind)!.label = "A local changed label";
    assert.throws(() => assertSyntheticBackendGraph(changed, sql), /does not match the synthetic seed/);
  }
  for (const prefix of ["membership:", "edge:", "relation:", "home:"]) {
    const changed = structuredClone(graph);
    const edge = changed.edges.find((candidate) => candidate.id.startsWith(prefix))!;
    edge.target = changed.nodes.find((node) => node.id !== edge.target)!.id;
    assert.throws(() => assertSyntheticBackendGraph(changed, sql), /does not match the synthetic seed/);
  }
  const extraField = structuredClone(graph);
  Object.assign(extraField.nodes[0], { contact: "Never export this" });
  assert.throws(() => assertSyntheticBackendGraph(extraField, sql), /node field/);
  const evidence = structuredClone(graph);
  Object.assign(evidence.edges[0], { evidence: { text: "Never export this" } });
  assert.throws(() => assertSyntheticBackendGraph(evidence, sql), /edge field/);
});
