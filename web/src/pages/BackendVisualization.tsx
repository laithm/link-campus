import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Focus,
  Network,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { api, USING_FIXTURES } from "../api/client";
import { BackendGraph } from "../components/BackendGraph";
import type { BackendGraphNode, BackendGraphResponse } from "../types/api";
import "../styles/backend-visualization.css";

const CATEGORIES = [
  { id: "people", label: "People" },
  { id: "groups", label: "Clubs & groups" },
  { id: "interests", label: "Interests" },
  { id: "activities", label: "Activities & work" },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];
function category(node: BackendGraphNode): Category {
  if (node.kind === "person") return "people";
  if (node.kind === "concept") return "interests";
  if (node.kind === "context") return "activities";
  return "groups";
}
function typeLabel(node: BackendGraphNode) {
  return node.kind === "concept"
    ? "Interest"
    : node.kind === "context"
      ? (node.subtype ?? "Activity")
      : node.kind === "lab"
        ? "Research lab"
        : node.kind;
}
const format = (n: number) => n.toLocaleString();

export function BackendVisualization() {
  const [data, setData] = useState<BackendGraphResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [enabled, setEnabled] = useState<Category[]>(
    CATEGORIES.map((item) => item.id),
  );
  const [onlyConnections, setOnlyConnections] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [resultLimit, setResultLimit] = useState(10);
  const [connectionLimit, setConnectionLimit] = useState(12);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [params, setParams] = useSearchParams();
  const requestedId = params.get("node");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api
      .getBackendGraph(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    setConnectionLimit(12);
    setCopied(false);
    setCopyFailed(false);
  }, [requestedId]);
  useEffect(() => {
    setResultLimit(10);
  }, [query, area, enabled]);

  const indexed = useMemo(() => {
    const nodes = new Map((data?.nodes ?? []).map((node) => [node.id, node]));
    const adjacent = new Map<
      string,
      { node: BackendGraphNode; label: string; outgoing: boolean }[]
    >();
    for (const edge of data?.edges ?? []) {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) continue;
      const outgoing = adjacent.get(source.id) ?? [];
      outgoing.push({ node: target, label: edge.label, outgoing: true });
      adjacent.set(source.id, outgoing);
      const incoming = adjacent.get(target.id) ?? [];
      incoming.push({ node: source, label: edge.label, outgoing: false });
      adjacent.set(target.id, incoming);
    }
    const counts = Object.fromEntries(
      CATEGORIES.map(({ id }) => [id, 0]),
    ) as Record<Category, number>;
    for (const node of nodes.values()) counts[category(node)]++;
    return { nodes, adjacent, counts };
  }, [data]);

  const areas = useMemo(
    () =>
      (data?.nodes ?? [])
        .filter((node) => node.kind === "department")
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  const filtered = useMemo(() => {
    let areaIds: Set<string> | null = null;
    if (area) {
      areaIds = new Set(
        (data?.nodes ?? [])
          .filter((node) => node.areaId === area || node.id === area)
          .map((node) => node.id),
      );
      for (const id of [...areaIds]) {
        for (const { node } of indexed.adjacent.get(id) ?? []) {
          if (node.kind === "concept" || node.kind === "context")
            areaIds.add(node.id);
        }
      }
    }
    const nodes = (data?.nodes ?? []).filter(
      (node) =>
        enabled.includes(category(node)) && (!areaIds || areaIds.has(node.id)),
    );
    const ids = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      ids,
      edges: (data?.edges ?? []).filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    };
  }, [data, enabled, area, indexed]);

  const selected =
    requestedId && filtered.ids.has(requestedId)
      ? indexed.nodes.get(requestedId)
      : undefined;
  const connections = useMemo(() => {
    if (!selected) return [];
    const grouped = new Map<
      string,
      { node: BackendGraphNode; relations: string[] }
    >();
    for (const { node, label, outgoing } of indexed.adjacent.get(selected.id) ??
      []) {
      if (!filtered.ids.has(node.id)) continue;
      const record = grouped.get(node.id) ?? { node, relations: [] };
      const relation = `${outgoing ? "→" : "←"} ${label}`;
      if (!record.relations.includes(relation)) record.relations.push(relation);
      grouped.set(node.id, record);
    }
    return [...grouped.values()].sort((a, b) => {
      const order = { people: 0, groups: 1, activities: 2, interests: 3 };
      return (
        order[category(a.node)] - order[category(b.node)] ||
        a.node.label.localeCompare(b.node.label)
      );
    });
  }, [selected, indexed, filtered.ids]);

  const graph = useMemo(() => {
    if (!onlyConnections || !selected) return filtered;
    const ids = new Set([
      selected.id,
      ...connections.map(({ node }) => node.id),
    ]);
    return {
      nodes: filtered.nodes.filter((node) => ids.has(node.id)),
      edges: filtered.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    };
  }, [filtered, onlyConnections, selected, connections]);
  const searchResults = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return [];
    return filtered.nodes
      .filter((node) => node.label.toLocaleLowerCase().includes(search))
      .sort(
        (a, b) =>
          Number(!a.label.toLocaleLowerCase().startsWith(search)) -
            Number(!b.label.toLocaleLowerCase().startsWith(search)) ||
          a.label.localeCompare(b.label),
      );
  }, [filtered.nodes, query]);
  const startingPoints = useMemo(
    () =>
      [...filtered.nodes]
        .filter(
          (node) =>
            node.kind === "person" ||
            node.kind === "club" ||
            node.kind === "context",
        )
        .sort(
          (a, b) =>
            (indexed.adjacent.get(b.id)?.length ?? 0) -
            (indexed.adjacent.get(a.id)?.length ?? 0),
        )
        .filter(
          (node, index, all) =>
            all.findIndex((other) => other.kind === node.kind) === index,
        )
        .slice(0, 3),
    [filtered.nodes, indexed],
  );

  function select(id: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("node", id);
        return next;
      },
      { replace: true },
    );
    setQuery("");
  }
  function clearSelection() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("node");
        return next;
      },
      { replace: true },
    );
    setOnlyConnections(false);
  }
  function reset() {
    clearSelection();
    setArea("");
    setEnabled(CATEGORIES.map((item) => item.id));
    setQuery("");
    setResetKey((value) => value + 1);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="backend-page">
      <Link className="backend-back" to="/settings">
        <ArrowLeft size={14} /> Settings
      </Link>
      <header className="backend-heading">
        <div>
          <div className="backend-kicker">HACKATHON / NETWORK EXPLORER</div>
          <h1>
            Visualise backend<span>.</span>
          </h1>
          <p>
            People, places and the things that bring them together. Follow the
            connections.
          </p>
        </div>
        <span className={`backend-source ${USING_FIXTURES ? "is-sample" : ""}`}>
          <span />
          {USING_FIXTURES ? "Sample database" : "Local database"}
        </span>
      </header>

      {error && (
        <div className="backend-error" role="alert">
          The graph could not be loaded. Check that the backend is running.
          <button onClick={() => setReload((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}
      {loading && !data && (
        <div className="backend-loading" role="status">
          <Network size={30} />
          Reading the campus connections…
        </div>
      )}

      {data && (
        <>
          <div className="backend-toolbar">
            <div className="backend-search-wrap">
              <label className="backend-search">
                <Search size={17} />
                <input
                  aria-label="Find a node"
                  placeholder="Find a person, club or topic"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              {query.trim() && (
                <div
                  className="backend-search-results"
                  aria-label="Node search results"
                >
                  <div className="backend-result-count" role="status">
                    {format(searchResults.length)}{" "}
                    {searchResults.length === 1 ? "node" : "nodes"} found
                  </div>
                  {searchResults.slice(0, resultLimit).map((node) => (
                    <button key={node.id} onClick={() => select(node.id)}>
                      <span
                        className={`backend-node-dot is-${category(node)}`}
                      />
                      <span>
                        <strong>{node.label}</strong>
                        <small>{typeLabel(node)}</small>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                  {!searchResults.length && (
                    <p>
                      Try another name or include more node types and areas.
                    </p>
                  )}
                  {searchResults.length > resultLimit && (
                    <button
                      className="backend-more"
                      onClick={() => setResultLimit((value) => value + 20)}
                    >
                      Show more results
                    </button>
                  )}
                </div>
              )}
            </div>
            <label className="backend-area">
              <span>Area</span>
              <select
                aria-label="Filter graph by area"
                value={area}
                onChange={(event) => setArea(event.target.value)}
              >
                <option value="">Whole campus</option>
                {areas.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="backend-reset" onClick={reset}>
              <RotateCcw size={15} />
              Reset view
            </button>
          </div>
          <div className="backend-workspace">
            <section
              className="backend-map"
              aria-label="Campus connection graph"
            >
              <div className="backend-map-heading">
                <span>THE CAMPUS, CONNECTED</span>
                <span aria-live="polite">
                  {format(graph.nodes.length)} nodes <i />{" "}
                  {format(graph.edges.length)} connections
                </span>
              </div>
              <div className="backend-canvas-frame">
                {graph.nodes.length ? (
                  <BackendGraph
                    nodes={graph.nodes}
                    edges={graph.edges}
                    selectedId={selected?.id ?? null}
                    onSelect={select}
                    focusId={selected?.id ?? null}
                    resetKey={resetKey}
                  />
                ) : (
                  <div className="backend-map-empty">
                    No nodes in this view.
                    <button onClick={reset}>Show the whole campus</button>
                  </div>
                )}
              </div>
              <div className="backend-legend" aria-label="Visible node types">
                {CATEGORIES.map(({ id, label }) => (
                  <button
                    key={id}
                    aria-pressed={enabled.includes(id)}
                    onClick={() =>
                      setEnabled((current) =>
                        current.includes(id)
                          ? current.filter((entry) => entry !== id)
                          : [...current, id],
                      )
                    }
                  >
                    <span className={`backend-node-dot is-${id}`} />
                    <span>{label}</span>
                    <small>{format(indexed.counts[id])}</small>
                  </button>
                ))}
              </div>
            </section>
            <aside className="backend-inspector" aria-label="Node details">
              <div className="backend-inspector-top">
                <span>CONNECTION NOTES</span>
                {selected && (
                  <button
                    aria-label="Clear selected node"
                    onClick={clearSelection}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              {selected ? (
                <>
                  <div className="backend-selected-type">
                    <span
                      className={`backend-node-dot is-${category(selected)}`}
                    />
                    {typeLabel(selected)}
                  </div>
                  <h2>{selected.label}</h2>
                  {selected.areaId && indexed.nodes.has(selected.areaId) && (
                    <p className="backend-node-area">
                      {indexed.nodes.get(selected.areaId)?.label}
                    </p>
                  )}
                  <div className="backend-node-actions">
                    {selected.id.startsWith("actor:") && (
                      <Link
                        to={`/network?person=${encodeURIComponent(selected.entityId)}`}
                      >
                        Open profile <ArrowUpRight size={13} />
                      </Link>
                    )}
                    <button onClick={copyLink}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                  </div>
                  {copyFailed && (
                    <p className="backend-copy-fallback" role="status">
                      Copy this link from your address bar.
                    </p>
                  )}
                  <button
                    className={`backend-focus ${onlyConnections ? "is-active" : ""}`}
                    aria-pressed={onlyConnections}
                    onClick={() => setOnlyConnections((value) => !value)}
                  >
                    <Focus size={16} />
                    {onlyConnections
                      ? "Show whole network"
                      : "Isolate connections"}
                  </button>
                  <div className="backend-connections-heading">
                    <h3>Connected to</h3>
                    <span>{format(connections.length)}</span>
                  </div>
                  <div className="backend-connection-list">
                    {connections
                      .slice(0, connectionLimit)
                      .map(({ node, relations }) => (
                        <button key={node.id} onClick={() => select(node.id)}>
                          <span
                            className={`backend-node-dot is-${category(node)}`}
                          />
                          <span>
                            <strong>{node.label}</strong>
                            <small>{relations.join(" · ")}</small>
                          </span>
                          <ArrowRight size={13} />
                        </button>
                      ))}
                    {!connections.length && (
                      <p>
                        No connections in this view. Try enabling more node
                        types or another area.
                      </p>
                    )}
                  </div>
                  {connections.length > connectionLimit && (
                    <button
                      className="backend-more"
                      onClick={() => setConnectionLimit((value) => value + 24)}
                    >
                      Show more connections (
                      {connections.length - connectionLimit})
                    </button>
                  )}
                </>
              ) : (
                <div className="backend-intro">
                  {requestedId && (
                    <div className="backend-selection-notice" role="status">
                      <p>
                        {indexed.nodes.has(requestedId)
                          ? "Your selected node is hidden by the current filters."
                          : "This node is no longer available in the visible database."}
                      </p>
                      <button
                        onClick={
                          indexed.nodes.has(requestedId)
                            ? () => {
                                setArea("");
                                setEnabled(CATEGORIES.map((item) => item.id));
                              }
                            : clearSelection
                        }
                      >
                        {indexed.nodes.has(requestedId)
                          ? "Show selected node"
                          : "Clear selection"}
                      </button>
                    </div>
                  )}
                  <div className="backend-mini-network" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <h2>
                    Every line has
                    <br />a reason.
                  </h2>
                  <p>
                    Hover a node to see its name. Select one to follow its
                    people, interests and activities.
                  </p>
                  <div className="backend-size-guide">
                    <span>
                      <i className="is-large" />
                      People & groups
                    </span>
                    <span>
                      <i />
                      Interests & activities
                    </span>
                  </div>
                  <h3>Start somewhere</h3>
                  {startingPoints.map((node) => (
                    <button
                      className="backend-start"
                      key={node.id}
                      onClick={() => select(node.id)}
                    >
                      <span
                        className={`backend-node-dot is-${category(node)}`}
                      />
                      <span>
                        {node.label}
                        <small>{typeLabel(node)}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  <p className="backend-keyboard-note">
                    You can also find any node using the search above.
                  </p>
                </div>
              )}
            </aside>
          </div>
          <footer className="backend-footnote">
            <p>
              {USING_FIXTURES
                ? "Synthetic campus records for the hackathon demo."
                : "Live connections from the local campus database."}{" "}
              Larger nodes are people and groups; smaller nodes are interests,
              courses, events and work. Positions help you explore; lines
              represent stored relationships.
            </p>
            <button
              disabled={loading}
              onClick={() => setReload((value) => value + 1)}
            >
              <RefreshCw size={13} className={loading ? "is-loading" : ""} />
              {loading ? "Refreshing…" : "Refresh data"}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
