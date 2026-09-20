// Export only graph records that match the checked-in synthetic seed. This
// never exports contacts, raw interest text, evidence, messages, or documents.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BackendGraphResponse } from "../src/types.js";

type SeedRow = Record<string, string | null>;

function decodeCopyField(value: string): string | null {
  if (value === "\\N") return null;
  const escapes: Record<string, string> = { t: "\t", n: "\n", r: "\r", b: "\b", f: "\f", v: "\v", "\\": "\\" };
  return value.replace(/\\([0-7]{1,3}|.)/g, (_match, character: string) =>
    /^[0-7]+$/.test(character) ? String.fromCharCode(parseInt(character, 8)) : escapes[character] ?? character,
  );
}

function readSeedTable(sql: string, table: string): SeedRow[] {
  const block = sql.match(new RegExp(`COPY public\\.${table} \\(([^\\n]+)\\) FROM stdin;\\n([\\s\\S]*?)\\n\\\\\\.`));
  if (!block) throw new Error(`Synthetic seed table ${table} was not found.`);
  const columns = block[1].split(", ");
  if (!block[2]) return [];
  return block[2].split("\n").map((line) => {
    const fields = line.split("\t").map(decodeCopyField);
    if (fields.length !== columns.length) throw new Error(`Synthetic seed table ${table} has an unexpected row shape.`);
    return Object.fromEntries(columns.map((column, index) => [column, fields[index]]));
  });
}

export function assertSyntheticBackendGraph(graph: BackendGraphResponse, sql: string): void {
  const byId = (table: string) => new Map(readSeedTable(sql, table).map((row) => [row.id, row]));
  const actors = byId("actor");
  const concepts = byId("concept");
  const contexts = byId("context");
  const edges = byId("edge");
  const relations = byId("concept_relation");
  const memberships = new Set(readSeedTable(sql, "actor_concept")
    .filter((row) => row.visibility !== "private" && row.concept_id)
    .map((row) => `membership:${row.actor_id}:${row.concept_id}`));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));

  function refuse(kind: string): never {
    // Do not print an unexpected label/value: it could be local private data.
    throw new Error(`Export stopped: a ${kind} does not match the synthetic seed.`);
  }

  if (Object.keys(graph).some((key) => !["nodes", "edges", "generatedAt"].includes(key)) ||
      !Number.isFinite(Date.parse(graph.generatedAt))) refuse("response shape");

  for (const node of graph.nodes) {
    if (Object.keys(node).some((key) => !["id", "entityId", "kind", "label", "subtype", "areaId"].includes(key))) refuse("node field");
    if (node.kind === "concept") {
      const seed = concepts.get(node.entityId);
      if (node.id !== `concept:${node.entityId}` || !seed || node.label !== seed.pref_label || node.areaId || node.subtype) refuse("concept");
    } else if (node.kind === "context") {
      const seed = contexts.get(node.entityId);
      if (node.id !== `context:${node.entityId}` || !seed || node.label !== (seed.title ?? "Untitled activity") || node.subtype !== (seed.kind ?? undefined) || node.areaId) refuse("context");
    } else {
      const seed = actors.get(node.entityId);
      const home = seed?.home_unit ? `actor:${seed.home_unit}` : undefined;
      const expectedArea = home && nodes.has(home) ? home : undefined;
      if (node.id !== `actor:${node.entityId}` || !seed || seed.discoverable !== "t" || node.kind !== seed.kind ||
          node.label !== (seed.display_name ?? "Unnamed profile") || node.areaId !== expectedArea || node.subtype) refuse("actor");
    }
  }
  if (nodes.size !== graph.nodes.length) refuse("duplicate node");
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (Object.keys(edge).some((key) => !["id", "source", "target", "kind", "label"].includes(key))) refuse("edge field");
    if (!nodes.has(edge.source) || !nodes.has(edge.target) || edgeIds.has(edge.id)) refuse("graph edge endpoint");
    edgeIds.add(edge.id);
    if (edge.id.startsWith("membership:")) {
      const expectedId = `membership:${nodes.get(edge.source)!.entityId}:${nodes.get(edge.target)!.entityId}`;
      if (edge.id !== expectedId || !memberships.has(edge.id) || !edge.source.startsWith("actor:") ||
          !edge.target.startsWith("concept:") || edge.kind !== "interest" || edge.label !== "has interest") refuse("membership");
    } else if (edge.id.startsWith("home:")) {
      const seed = actors.get(edge.id.slice("home:".length));
      if (!seed || edge.source !== `actor:${seed.id}` || edge.target !== `actor:${seed.home_unit}` ||
          edge.kind !== "home_unit" || edge.label !== "home unit") refuse("home unit relationship");
    } else if (edge.id.startsWith("edge:")) {
      const seed = edges.get(edge.id.slice("edge:".length));
      const label = seed?.relation?.replaceAll("_", " ");
      if (!seed || seed.visibility === "private" || seed.src_type !== "actor" ||
          edge.source !== `actor:${seed.src_id}` || edge.target !== `${seed.dst_type}:${seed.dst_id}` ||
          edge.kind !== seed.relation || ![label, `Past: ${label}`].includes(edge.label)) refuse("stored relationship");
    } else if (edge.id.startsWith("relation:")) {
      const seed = relations.get(edge.id.slice("relation:".length));
      if (!seed || edge.source !== `concept:${seed.src_id}` || edge.target !== `concept:${seed.dst_id}` ||
          edge.kind !== seed.kind || edge.label !== seed.kind?.replaceAll("_", " ")) refuse("concept relation");
    } else refuse("relationship type");
  }
}

async function main() {
  if (!process.argv.includes("--seed-only")) {
    throw new Error("Pass --seed-only to export the checked-in synthetic graph.");
  }
  const { pool } = await import("../src/db.js");
  const { getBackendGraph } = await import("../src/services/backendGraph.js");
  try {
    const sql = await readFile(new URL("../db/seed-data/snapshot.sql", import.meta.url), "utf8");
    const graph = await getBackendGraph();
    assertSyntheticBackendGraph(graph, sql);
    await writeFile(new URL("../web/src/home/backend-snapshot.json", import.meta.url), JSON.stringify(graph) + "\n");
    console.log(`Exported ${graph.nodes.length} validated synthetic nodes and ${graph.edges.length} stored relationships.`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Backend preview export failed.");
    process.exitCode = 1;
  });
}
