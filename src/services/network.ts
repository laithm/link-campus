import { pool } from "../db.js";
import { normalizeRarity } from "./idf.js";
import type { ActorSummary, ContactBlock, NetworkActor, NetworkDirectoryResponse } from "../types.js";

type NetworkRow = {
  id: string;
  kind: ActorSummary["kind"];
  person_kind: ActorSummary["personKind"] | null;
  display_name: string;
  has_account: boolean;
  home_unit_id: string | null;
  home_unit_name: string | null;
  concepts: { conceptId: string; label: string; shownAs: string; idf: number }[];
  methods: ContactBlock["methods"];
  max_idf: number | null;
};

/** A complete, privacy-filtered directory from one consistent SQL snapshot. */
export async function getNetworkDirectory(): Promise<NetworkDirectoryResponse> {
  const { rows } = await pool.query<NetworkRow>(
    `WITH visible_actors AS MATERIALIZED (
       SELECT a.id, a.kind, a.person_kind,
              COALESCE(a.display_name, 'Unnamed profile') AS display_name,
              a.has_account, hu.id AS home_unit_id, hu.display_name AS home_unit_name
       FROM actor a
       LEFT JOIN actor hu ON hu.id = a.home_unit AND hu.discoverable = true
       WHERE a.discoverable = true
     ), memberships AS (
       SELECT DISTINCT ON (ac.actor_id, c.id)
              ac.actor_id, c.id AS concept_id, c.pref_label, ac.raw_text,
              COALESCE(idf.idf, 0) AS idf
       FROM actor_concept ac
       JOIN visible_actors a ON a.id = ac.actor_id
       JOIN concept c ON c.id = ac.concept_id
       LEFT JOIN concept_idf idf ON idf.concept_id = c.id
       WHERE ac.visibility <> 'private'
       ORDER BY ac.actor_id, c.id, ac.resolved_at DESC NULLS LAST, ac.id
     ), concept_lists AS (
       SELECT actor_id,
              jsonb_agg(jsonb_build_object(
                'conceptId', concept_id, 'label', pref_label,
                'shownAs', raw_text, 'idf', idf
              ) ORDER BY idf DESC, pref_label, concept_id) AS concepts
       FROM memberships GROUP BY actor_id
     ), contact_lists AS (
       SELECT cm.actor_id,
              jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'kind', cm.kind, 'value', cm.value, 'label', cm.label
              )) ORDER BY cm.sort_order, cm.id) AS methods
       FROM actor_contact_method cm
       JOIN visible_actors a ON a.id = cm.actor_id
       WHERE cm.visibility <> 'private'
       GROUP BY cm.actor_id
     )
     SELECT a.*, COALESCE(cl.concepts, '[]'::jsonb) AS concepts,
            COALESCE(ct.methods, '[]'::jsonb) AS methods,
            (SELECT max(idf) FROM concept_idf) AS max_idf
     FROM visible_actors a
     LEFT JOIN concept_lists cl ON cl.actor_id = a.id
     LEFT JOIN contact_lists ct ON ct.actor_id = a.id
     ORDER BY lower(a.display_name), a.id`,
  );

  const areas = new Map<string, NetworkDirectoryResponse["areas"][number]>();
  const concepts = new Map<string, NetworkDirectoryResponse["concepts"][number]>();
  let memberships = 0;
  const actors: NetworkActor[] = rows.map((row) => {
    const homeUnit = row.home_unit_id
      ? { id: row.home_unit_id, name: row.home_unit_name ?? "Unnamed area" }
      : undefined;
    const area = homeUnit ?? { id: "unassigned", name: "Unassigned" };
    const areaCount = areas.get(area.id) ?? { ...area, count: 0 };
    areaCount.count++;
    areas.set(area.id, areaCount);
    for (const concept of row.concepts) {
      const aggregate = concepts.get(concept.conceptId) ?? { id: concept.conceptId, label: concept.label, count: 0 };
      aggregate.count++;
      concepts.set(concept.conceptId, aggregate);
    }
    memberships += row.concepts.length;
    return {
      id: row.id,
      kind: row.kind,
      personKind: row.person_kind ?? undefined,
      displayName: row.display_name,
      homeUnit,
      topConcepts: row.concepts.slice(0, 5).map((concept) => ({
        conceptId: concept.conceptId,
        label: concept.label,
        shownAs: concept.shownAs,
        rarity: normalizeRarity(concept.idf, row.max_idf ?? 0),
      })),
      concepts: row.concepts.map(({ conceptId, label }) => ({ conceptId, label })),
      contact: { hasAccount: row.has_account, methods: row.methods },
    };
  });
  const people = actors.filter((actor) => actor.kind === "person").length;
  return {
    actors,
    areas: [...areas.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    concepts: [...concepts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    totals: {
      people,
      communities: actors.length - people,
      areas: areas.size,
      concepts: concepts.size,
      memberships,
    },
    generatedAt: new Date().toISOString(),
  };
}
