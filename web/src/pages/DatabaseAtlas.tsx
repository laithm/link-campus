import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers3,
  Network,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { api, USING_FIXTURES } from "../api/client";
import { initials } from "../components/Avatar";
import type { NetworkActor, NetworkDirectoryResponse } from "../types/api";
import "../styles/database-atlas.css";

const PAGE_SIZE = 24;
const UNASSIGNED = "unassigned";
type FilterPatch = Record<string, string | null>;

function roleLabel(actor: NetworkActor) {
  if (actor.kind === "person")
    return actor.personKind
      ? (
          {
            student: "Student",
            faculty: "Faculty",
            staff: "Staff",
            alum: "Alumni",
          } as const
        )[actor.personKind]
      : "Person";
  return (
    {
      club: "Club",
      lab: "Research lab",
      department: "Department",
      company: "Company",
    } as const
  )[actor.kind];
}

function topWithSelection<T extends { id: string; count: number }>(
  items: T[],
  selected: string | null,
) {
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 6);
  const chosen = sorted.find((item) => item.id === selected);
  if (chosen && !top.some((item) => item.id === chosen.id))
    top.splice(5, 1, chosen);
  return top;
}

function ProfileDrawer({
  actor,
  actors,
  activeTopic,
  profileHref,
  onClose,
  onExplore,
}: {
  actor: NetworkActor;
  actors: NetworkActor[];
  activeTopic: string | null;
  profileHref: (id: string) => string;
  onClose: () => void;
  onExplore: (patch: FilterPatch) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const [relatedTopic, setRelatedTopic] = useState(() =>
    actor.concepts.some((topic) => topic.conceptId === activeTopic)
      ? activeTopic!
      : (actor.concepts[0]?.conceptId ?? ""),
  );
  const related = actors.filter(
    (other) =>
      other.id !== actor.id &&
      other.concepts.some((topic) => topic.conceptId === relatedTopic),
  );
  const relatedLabel = actor.concepts.find(
    (topic) => topic.conceptId === relatedTopic,
  )?.label;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const items = [
        ...(panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input, select, [tabindex="0"]',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      const first = items[0],
        last = items[items.length - 1];
      if (
        (!event.shiftKey && document.activeElement === last) ||
        !panelRef.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function copyProfile() {
    try {
      await navigator.clipboard.writeText(
        new URL(profileHref(actor.id), window.location.origin).href,
      );
      setCopied(true);
    } catch {
      setCopyFallback(true);
    }
  }

  return (
    <div
      className="db-profile-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="db-profile-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="db-profile-topline">
          <span>NETWORK PROFILE</span>
          <button
            className="db-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close profile"
          >
            <X size={20} />
          </button>
        </div>
        <div className="db-profile-monogram" aria-hidden="true">
          {actor.kind === "person" ? (
            initials(actor.displayName)
          ) : (
            <Building2 size={32} strokeWidth={1.3} />
          )}
        </div>
        <span className="db-profile-role">{roleLabel(actor)}</span>
        <h2 id={titleId}>{actor.displayName}</h2>
        <button
          type="button"
          className="db-profile-area"
          onClick={() =>
            onExplore({
              area: actor.homeUnit?.id ?? UNASSIGNED,
              topic: null,
              q: null,
              kind: null,
            })
          }
        >
          <Building2 size={15} />
          {actor.homeUnit?.name ?? "No area assigned"}
          <ArrowUpRight size={14} />
        </button>
        <button type="button" className="db-copy-profile" onClick={copyProfile}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Profile link copied" : "Copy profile link"}
        </button>
        {copyFallback && (
          <label className="db-copy-fallback">
            Copy this profile link
            <input
              readOnly
              value={
                new URL(profileHref(actor.id), window.location.origin).href
              }
              onFocus={(event) => event.target.select()}
            />
          </label>
        )}
        <section className="db-profile-section">
          <div className="db-section-label">
            <h3>Interests</h3>
            <span>{actor.concepts.length}</span>
          </div>
          <p>Choose an interest to find your common ground.</p>
          <div className="db-profile-interests">
            {actor.concepts.map((topic) => (
              <button
                key={topic.conceptId}
                type="button"
                className={relatedTopic === topic.conceptId ? "is-active" : ""}
                aria-pressed={relatedTopic === topic.conceptId}
                onClick={() => setRelatedTopic(topic.conceptId)}
              >
                {topic.label}
                <ArrowDown size={12} />
              </button>
            ))}
          </div>
          {!actor.concepts.length && (
            <p className="db-muted">
              No discoverable interests have been added yet.
            </p>
          )}
        </section>
        {relatedTopic && (
          <section className="db-profile-section db-related-section">
            <div className="db-section-label">
              <h3>Also into {relatedLabel}</h3>
              <span>{related.length}</span>
            </div>
            {related.length ? (
              <div className="db-related-list">
                {related.slice(0, 5).map((other) => (
                  <Link key={other.id} to={profileHref(other.id)}>
                    <span className="db-related-initials" aria-hidden="true">
                      {initials(other.displayName)}
                    </span>
                    <span>
                      <strong>{other.displayName}</strong>
                      <small>
                        {roleLabel(other)}
                        {other.homeUnit ? ` · ${other.homeUnit.name}` : ""}
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="db-muted">
                No other profiles share this interest yet.
              </p>
            )}
            <button
              type="button"
              className="db-text-link"
              onClick={() =>
                onExplore({
                  topic: relatedTopic,
                  area: null,
                  q: null,
                  kind: null,
                })
              }
            >
              Explore everyone with this interest
              <ArrowRight size={15} />
            </button>
          </section>
        )}
        <p className="db-profile-note">
          Interests connect these profiles. A shared interest does not imply
          they know each other.
        </p>
      </div>
    </div>
  );
}

export function DatabaseAtlas() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<NetworkDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const directoryRef = useRef<HTMLElement>(null);
  const query = params.get("q") ?? "";
  const area = params.get("area");
  const topic = params.get("topic");
  const kind = ["people", "communities"].includes(params.get("kind") ?? "")
    ? params.get("kind")!
    : "all";
  const personId = params.get("person");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api
      .getNetwork(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setData(response);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  function patchParams(patch: FilterPatch, replace = false) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(patch).forEach(([key, value]) => {
          if (value) next.set(key, value);
          else next.delete(key);
        });
        return next;
      },
      { replace },
    );
  }
  function filter(patch: FilterPatch, replace = false) {
    patchParams({ page: null, person: null, ...patch }, replace);
  }
  function profileHref(id: string) {
    const next = new URLSearchParams(params);
    next.set("person", id);
    return `/network?${next.toString()}`;
  }
  function topicHref(id: string) {
    const next = new URLSearchParams(params);
    next.set("topic", id);
    next.delete("person");
    next.delete("page");
    return `/network?${next.toString()}`;
  }
  function reset() {
    setParams({});
  }

  const actors = data?.actors ?? [];
  const selected = actors.find((actor) => actor.id === personId);
  const activeArea = data?.areas.find((item) => item.id === area);
  const activeTopic = data?.concepts.find((item) => item.id === topic);
  const hasFilters = Boolean(query || area || topic || kind !== "all");
  const filtered = useMemo(() => {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return actors.filter((actor) => {
      if (kind === "people" && actor.kind !== "person") return false;
      if (kind === "communities" && actor.kind === "person") return false;
      if (area && (actor.homeUnit?.id ?? UNASSIGNED) !== area) return false;
      if (
        topic &&
        !actor.concepts.some((concept) => concept.conceptId === topic)
      )
        return false;
      const text = [
        actor.displayName,
        actor.homeUnit?.name ?? "Unassigned No area assigned",
        roleLabel(actor),
        ...actor.concepts.map((concept) => concept.label),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [actors, query, area, topic, kind]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requestedPage = Number(params.get("page") ?? 1);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(pages, Math.floor(requestedPage)))
    : 1;
  const pageActors = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mapAreas = useMemo(
    () => topWithSelection(data?.areas ?? [], area),
    [data, area],
  );
  const mapTopics = useMemo(
    () => topWithSelection(data?.concepts ?? [], topic),
    [data, topic],
  );
  const memberships = useMemo(() => {
    const counts = new Map<string, number>();
    actors.forEach((actor) => {
      const areaId = actor.homeUnit?.id ?? UNASSIGNED;
      new Set(actor.concepts.map((concept) => concept.conceptId)).forEach(
        (conceptId) => {
          const key = `${areaId}:${conceptId}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        },
      );
    });
    return counts;
  }, [actors]);
  const mapEdges = mapAreas
    .flatMap((lane, areaIndex) =>
      mapTopics.flatMap((interest, topicIndex) => {
        const count = memberships.get(`${lane.id}:${interest.id}`) ?? 0;
        return count
          ? [
              {
                areaId: lane.id,
                topicId: interest.id,
                areaLabel: lane.name,
                topicLabel: interest.label,
                areaIndex,
                topicIndex,
                count,
              },
            ]
          : [];
      }),
    )
    .sort((a, b) => b.count - a.count);
  const mapRows = Math.max(mapAreas.length, mapTopics.length, 1);
  const maxEdge = Math.max(1, ...mapEdges.map((edge) => edge.count));
  const diagramId = useId().replace(/:/g, "");

  return (
    <div className="database-atlas">
      <header className="db-intro">
        <div>
          <div className="db-eyebrow">
            <span />
            DATABASE ATLAS
          </div>
          <h1>
            Inside the network<span>.</span>
          </h1>
          <p>People, departments and the interests between them.</p>
        </div>
        <dl className="db-census" aria-label="Network totals">
          {[
            ["People", data?.totals.people],
            ["Communities", data?.totals.communities],
            ["Areas", data?.totals.areas],
            ["Interests", data?.totals.concepts],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {loading
                  ? "—"
                  : typeof value === "number"
                    ? value.toLocaleString()
                    : "—"}
              </dd>
            </div>
          ))}
        </dl>
      </header>
      {loading ? (
        <div className="db-state db-loading" role="status">
          <Network size={28} strokeWidth={1.2} />
          <h2>Bringing the network into view.</h2>
          <p>Loading people, areas and shared interests.</p>
          <div className="db-loading-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      ) : error ? (
        <div className="db-state" role="alert">
          <Network size={28} strokeWidth={1.2} />
          <h2>The network could not be loaded.</h2>
          <p>Please try again to reconnect to the directory.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <section className="db-map" aria-labelledby="db-map-title">
            <div className="db-map-heading">
              <div>
                <span className="db-kicker">FIND THE INTERSECTIONS</span>
                <h2 id="db-map-title">Different areas. Common ground.</h2>
              </div>
              <a href="#db-directory" className="db-map-jump">
                Explore the directory
                <ArrowDown size={15} />
              </a>
            </div>
            <div className="db-map-column-labels">
              <span>
                <i className="db-key-area" />
                AREAS
              </span>
              <span>PROFILES WITH A SHARED INTEREST</span>
              <span>
                INTERESTS
                <i className="db-key-topic" />
              </span>
            </div>
            {mapEdges.length ? (
              <div
                className="db-map-stage"
                style={{ "--map-rows": mapRows } as CSSProperties}
              >
                <div className="db-map-lanes" aria-label="Filter by area">
                  {mapAreas.map((lane) => (
                    <button
                      key={lane.id}
                      type="button"
                      title={lane.name}
                      className={area === lane.id ? "is-active" : ""}
                      aria-pressed={area === lane.id}
                      onClick={() =>
                        filter({ area: area === lane.id ? null : lane.id })
                      }
                    >
                      <span>{lane.name}</span>
                      <small>
                        {topic
                          ? (memberships.get(`${lane.id}:${topic}`) ?? 0)
                          : lane.count}
                      </small>
                      <i />
                    </button>
                  ))}
                </div>
                <svg
                  className="db-map-connections"
                  viewBox={`0 0 400 ${mapRows * 48}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Connections show how many profiles in each area share each interest. Select an area or interest to filter the directory."
                >
                  <defs>
                    <linearGradient id={`${diagramId}-edge`}>
                      <stop offset="0" stopColor="#3156d3" />
                      <stop offset="1" stopColor="#dc673e" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2].map((line) => (
                    <line
                      key={line}
                      x1={100 + line * 100}
                      x2={100 + line * 100}
                      y1="0"
                      y2={mapRows * 48}
                      stroke="#d9dfeb"
                      strokeDasharray="2 6"
                    />
                  ))}
                  {mapEdges.map((edge) => {
                    const matches =
                      (!area || area === edge.areaId) &&
                      (!topic || topic === edge.topicId);
                    const highlighted = Boolean(area || topic) && matches;
                    return (
                      <path
                        key={`${edge.areaId}:${edge.topicId}`}
                        d={`M0 ${edge.areaIndex * 48 + 24} C160 ${edge.areaIndex * 48 + 24},240 ${edge.topicIndex * 48 + 24},400 ${edge.topicIndex * 48 + 24}`}
                        fill="none"
                        stroke={`url(#${diagramId}-edge)`}
                        strokeWidth={1.1 + Math.sqrt(edge.count / maxEdge) * 9}
                        opacity={!matches ? 0.055 : highlighted ? 0.72 : 0.25}
                      >
                        <title>
                          {edge.areaLabel} → {edge.topicLabel}: {edge.count}{" "}
                          {edge.count === 1 ? "profile" : "profiles"}
                        </title>
                      </path>
                    );
                  })}
                </svg>
                <div className="db-map-topics" aria-label="Filter by interest">
                  {mapTopics.map((interest) => (
                    <button
                      key={interest.id}
                      type="button"
                      title={interest.label}
                      className={topic === interest.id ? "is-active" : ""}
                      aria-pressed={topic === interest.id}
                      onClick={() =>
                        filter({
                          topic: topic === interest.id ? null : interest.id,
                        })
                      }
                    >
                      <i />
                      <span>{interest.label}</span>
                      <small>
                        {area
                          ? (memberships.get(`${area}:${interest.id}`) ?? 0)
                          : interest.count}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="db-map-empty">
                As profiles add their interests, their connections across areas
                will appear here.
              </div>
            )}
            <div className="db-map-footer">
              <p>
                <span className="db-line-key" />
                Thicker lines mean more profiles share an interest.
              </p>
              <span>
                Showing {mapAreas.length} of {data?.areas.length ?? 0} areas ·{" "}
                {mapTopics.length} of {data?.concepts.length ?? 0} interests
              </span>
            </div>
          </section>
          <section
            className="db-directory"
            id="db-directory"
            ref={directoryRef}
            aria-labelledby="db-directory-title"
          >
            <div className="db-directory-heading">
              <div>
                <span className="db-kicker">EVERY PROFILE HAS A PLACE</span>
                <h2 id="db-directory-title">
                  Explore the directory<span> / {actors.length}</span>
                </h2>
              </div>
              <span className="db-directory-context">
                <Network size={14} />
                {USING_FIXTURES ? "Seed database snapshot" : "Live database"}
              </span>
            </div>
            <div className="db-directory-layout">
              <aside className="db-area-index" aria-label="Area filters">
                <div className="db-area-index-heading">
                  <Layers3 size={15} />
                  <h3>Browse areas</h3>
                </div>
                <div className="db-area-nav">
                  <button
                    type="button"
                    className={!area ? "is-active" : ""}
                    aria-pressed={!area}
                    onClick={() => filter({ area: null })}
                  >
                    <span>All areas</span>
                    <span>{actors.length}</span>
                  </button>
                  {data?.areas.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      title={item.name}
                      className={area === item.id ? "is-active" : ""}
                      aria-pressed={area === item.id}
                      onClick={() => filter({ area: item.id })}
                    >
                      <span>{item.name}</span>
                      <span>{item.count}</span>
                    </button>
                  ))}
                </div>
                <p className="db-area-index-note">
                  Areas reflect each profile’s home department or unit.
                </p>
              </aside>
              <div className="db-directory-content">
                <div className="db-toolbar">
                  <label className="db-search">
                    <Search size={17} aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) =>
                        filter({ q: event.target.value || null }, true)
                      }
                      placeholder="Search a name, area or interest"
                      aria-label="Search all profiles by name, area or interest"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => filter({ q: null })}
                        aria-label="Clear search"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </label>
                  <label className="db-topic-select">
                    <SlidersHorizontal size={14} aria-hidden="true" />
                    <select
                      value={topic ?? ""}
                      onChange={(event) =>
                        filter({ topic: event.target.value || null })
                      }
                      aria-label="Filter by interest"
                    >
                      <option value="">All interests</option>
                      {data?.concepts.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.label} ({concept.count})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="db-results-toolbar">
                  <div
                    className="db-kind-filter"
                    role="group"
                    aria-label="Profile type"
                  >
                    {[
                      ["all", "Everyone"],
                      ["people", "People"],
                      ["communities", "Communities"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={kind === value ? "is-active" : ""}
                        aria-pressed={kind === value}
                        onClick={() =>
                          filter({ kind: value === "all" ? null : value })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="db-result-count" role="status">
                    {filtered.length}{" "}
                    {filtered.length === 1 ? "profile" : "profiles"}
                  </span>
                </div>
                {hasFilters && (
                  <div className="db-active-filters">
                    {area && (
                      <button
                        type="button"
                        onClick={() => filter({ area: null })}
                      >
                        {activeArea?.name ?? "Unknown area"}
                        <X size={12} />
                      </button>
                    )}
                    {topic && (
                      <button
                        type="button"
                        onClick={() => filter({ topic: null })}
                      >
                        {activeTopic?.label ?? "Unknown interest"}
                        <X size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="db-clear-filters"
                      onClick={reset}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                {pageActors.length ? (
                  <>
                    <div className="db-profile-grid">
                      {pageActors.map((actor) => (
                        <article
                          key={actor.id}
                          className={`db-actor-card${actor.kind === "person" ? "" : " is-community"}`}
                        >
                          <Link
                            to={profileHref(actor.id)}
                            className="db-actor-link"
                            aria-label={`Open ${actor.displayName}'s profile`}
                          >
                            <span
                              className="db-actor-avatar"
                              aria-hidden="true"
                            >
                              {actor.kind === "person" ? (
                                initials(actor.displayName)
                              ) : (
                                <Building2 size={21} strokeWidth={1.3} />
                              )}
                            </span>
                            <ArrowUpRight
                              className="db-actor-arrow"
                              size={17}
                            />
                            <span className="db-actor-role">
                              {roleLabel(actor)}
                            </span>
                            <h3>{actor.displayName}</h3>
                            <p>{actor.homeUnit?.name ?? "No area assigned"}</p>
                          </Link>
                          <div className="db-actor-topics">
                            {actor.concepts.slice(0, 3).map((concept) => (
                              <Link
                                key={concept.conceptId}
                                to={topicHref(concept.conceptId)}
                                title={`Explore ${concept.label}`}
                              >
                                {concept.label}
                              </Link>
                            ))}
                            {actor.concepts.length > 3 && (
                              <Link
                                className="db-actor-more"
                                to={profileHref(actor.id)}
                                aria-label={`View all ${actor.concepts.length} interests for ${actor.displayName}`}
                              >
                                +{actor.concepts.length - 3}
                              </Link>
                            )}
                            {!actor.concepts.length && (
                              <span className="db-no-interests">
                                No interests added yet
                              </span>
                            )}
                          </div>
                          <Link
                            to={profileHref(actor.id)}
                            className="db-actor-bottom"
                          >
                            View profile
                            <span>
                              {actor.concepts.length}{" "}
                              {actor.concepts.length === 1
                                ? "interest"
                                : "interests"}
                              <ArrowRight size={13} />
                            </span>
                          </Link>
                        </article>
                      ))}
                    </div>
                    <nav className="db-pagination" aria-label="Directory pages">
                      <p>
                        Showing {(page - 1) * PAGE_SIZE + 1}–
                        {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                        {filtered.length}
                      </p>
                      <div>
                        <button
                          type="button"
                          disabled={page <= 1}
                          aria-label="Previous page"
                          onClick={() => {
                            patchParams({
                              page: page <= 2 ? null : String(page - 1),
                              person: null,
                            });
                            directoryRef.current?.scrollIntoView({
                              block: "start",
                            });
                          }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span>
                          Page {page} of {pages}
                        </span>
                        <button
                          type="button"
                          disabled={page >= pages}
                          aria-label="Next page"
                          onClick={() => {
                            patchParams({
                              page: String(page + 1),
                              person: null,
                            });
                            directoryRef.current?.scrollIntoView({
                              block: "start",
                            });
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </nav>
                  </>
                ) : (
                  <div className="db-directory-empty">
                    <Users size={26} strokeWidth={1.3} />
                    <h3>No profiles in this intersection.</h3>
                    <p>
                      Try another name, area or interest to open up your search.
                    </p>
                    <button type="button" onClick={reset}>
                      Explore all profiles
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
          <footer className="db-page-note">
            <span>
              <i />
              {actors.length} discoverable profiles ·{" "}
              {data?.totals.memberships.toLocaleString() ?? 0} interest
              memberships
            </span>
            <span>
              {USING_FIXTURES ? "Seed database snapshot" : "Live database"} ·
              Areas are home departments or units.
            </span>
          </footer>
        </>
      )}
      {!loading && !error && personId && !selected && (
        <div className="db-missing-profile" role="status">
          This profile is unavailable in the current directory.
          <button type="button" onClick={() => patchParams({ person: null })}>
            Dismiss
            <X size={14} />
          </button>
        </div>
      )}
      {!loading && !error && selected && (
        <ProfileDrawer
          key={selected.id}
          actor={selected}
          actors={actors}
          activeTopic={topic}
          profileHref={profileHref}
          onClose={() => patchParams({ person: null })}
          onExplore={filter}
        />
      )}
    </div>
  );
}

export default DatabaseAtlas;
