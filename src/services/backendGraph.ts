import { pool } from "../db.js";
import type { BackendGraphResponse } from "../types.js";

/** Stored graph relationships, projected without contacts or raw evidence. */
export async function getBackendGraph(): Promise<BackendGraphResponse> {
  const { rows } = await pool.query<Omit<BackendGraphResponse, "generatedAt">>(
    `WITH visible_actors AS MATERIALIZED (
       SELECT a.id, a.kind, COALESCE(a.display_name, 'Unnamed profile') AS label,
              hu.id AS home_unit
       FROM actor a
       LEFT JOIN actor hu ON hu.id = a.home_unit AND hu.discoverable = true
       WHERE a.discoverable = true
     ), memberships AS MATERIALIZED (
       SELECT DISTINCT ac.actor_id, ac.concept_id
       FROM actor_concept ac
       JOIN visible_actors a ON a.id = ac.actor_id
       JOIN concept c ON c.id = ac.concept_id
       WHERE ac.visibility <> 'private'
     ), visible_concepts AS MATERIALIZED (
       SELECT c.id, c.pref_label AS label
       FROM concept c WHERE EXISTS (
         SELECT 1 FROM memberships m WHERE m.concept_id = c.id
       )
     ), visible_edges AS MATERIALIZED (
       SELECT e.id, e.src_id, e.dst_id, e.dst_type, e.relation, e.valid_to
       FROM edge e
       JOIN visible_actors a ON a.id = e.src_id AND e.src_type = 'actor'
       WHERE e.visibility <> 'private' AND (
         (e.dst_type = 'actor' AND EXISTS (SELECT 1 FROM visible_actors b WHERE b.id = e.dst_id))
         OR (e.dst_type = 'context' AND EXISTS (SELECT 1 FROM context c WHERE c.id = e.dst_id))
       )
     ), visible_contexts AS (
       SELECT c.id, c.kind, COALESCE(c.title, 'Untitled activity') AS label
       FROM context c WHERE EXISTS (
         SELECT 1 FROM visible_edges e WHERE e.dst_type = 'context' AND e.dst_id = c.id
       )
     ), graph_nodes AS (
       SELECT 'actor:' || id AS id, id::text AS entity_id, kind, label,
              NULL::text AS subtype, 'actor:' || home_unit AS area_id
       FROM visible_actors
       UNION ALL
       SELECT 'concept:' || id, id::text, 'concept', label, NULL, NULL FROM visible_concepts
       UNION ALL
       SELECT 'context:' || id, id::text, 'context', label, kind, NULL FROM visible_contexts
     ), graph_edges AS (
       SELECT 'membership:' || actor_id || ':' || concept_id AS id,
              'actor:' || actor_id AS source, 'concept:' || concept_id AS target,
              'interest'::text AS kind, 'has interest'::text AS label
       FROM memberships
       UNION ALL
       SELECT 'edge:' || id, 'actor:' || src_id, dst_type || ':' || dst_id,
              relation, CASE WHEN valid_to < current_date THEN 'Past: ' ELSE '' END || replace(relation, '_', ' ')
       FROM visible_edges
       UNION ALL
       SELECT 'home:' || id, 'actor:' || id, 'actor:' || home_unit, 'home_unit', 'home unit'
       FROM visible_actors WHERE home_unit IS NOT NULL AND home_unit <> id
       UNION ALL
       SELECT 'relation:' || r.id, 'concept:' || r.src_id, 'concept:' || r.dst_id,
              r.kind, replace(r.kind, '_', ' ')
       FROM concept_relation r
       JOIN visible_concepts source ON source.id = r.src_id
       JOIN visible_concepts target ON target.id = r.dst_id
     )
     SELECT
       COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
         'id', id, 'entityId', entity_id, 'kind', kind, 'label', label,
         'subtype', subtype, 'areaId', area_id
       )) ORDER BY id) FROM graph_nodes), '[]'::jsonb) AS nodes,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', id, 'source', source, 'target', target, 'kind', kind, 'label', label
       ) ORDER BY id) FROM graph_edges), '[]'::jsonb) AS edges`,
  );
  return { ...rows[0], generatedAt: new Date().toISOString() };
}
