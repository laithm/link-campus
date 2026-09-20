import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  CircleHelp,
  Compass,
  Layers3,
  Maximize2,
  Minimize2,
  Minus,
  MoveUpRight,
  Network,
  Pause,
  Play,
  Plus,
  Search,
  Link2,
  Users,
  X,
} from "lucide-react";
import { api, USING_FIXTURES } from "../api/client";
import { Avatar, initials } from "../components/Avatar";
import { PersonPanel } from "../components/PersonPanel";
import { EventPanel } from "../components/EventPanel";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type {
  AtlasResponse,
  ConnectionSuggestion,
  EventSuggestion,
} from "../types/api";
const NetworkAtlas = lazy(() =>
  import("../components/NetworkAtlas").then((m) => ({
    default: m.NetworkAtlas,
  })),
);

const InterestGlobe = lazy(() =>
  import("../components/InterestGlobe").then((m) => ({
    default: m.InterestGlobe,
  })),
);
const ATLAS_LIMIT = 12;
const INTEREST_COLORS = ["#3156d3", "#8c6cac", "#dc673e", "#4f8d9a", "#8585a7"];

export function Home() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [atlas, setAtlas] = useState<AtlasResponse | null>(null);
  const [atlasFor, setAtlasFor] = useState<string | null>(null);
  const [communitySuggestions, setCommunitySuggestions] = useState<
    ConnectionSuggestion[]
  >([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [events, setEvents] = useState<EventSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [audience, setAudience] = useState<"people" | "societies" | "events">(
    "people",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConnectionSuggestion | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventSuggestion | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [still, setStill] = useReducedMotion();
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("link.saved-connections") ?? "[]",
      );
      return Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const interests = atlas?.interests ?? [];
  const interest = params.get("interest");
  const activeGroup = interests.findIndex((c) => c.conceptId === interest);
  const activeInterest = interests.find((c) => c.conceptId === interest);
  function load() {
    setRetry((value) => value + 1);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api
      .getAtlas(interest ?? undefined, ATLAS_LIMIT, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setAtlas(response);
        setAtlasFor(interest);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [interest, retry]);
  useEffect(() => {
    let cancelled = false;
    api
      .getEventSuggestions()
      .then((items) => {
        if (!cancelled) setEvents(items);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (audience !== "societies") return;
    let cancelled = false;
    setCommunityLoading(true);
    setCommunityError(false);
    api
      .getSuggestions(50)
      .then((items) => {
        if (!cancelled)
          setCommunitySuggestions(
            items.filter((s) => s.actor.kind !== "person"),
          );
      })
      .catch(() => {
        if (!cancelled) setCommunityError(true);
      })
      .finally(() => {
        if (!cancelled) setCommunityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audience, retry]);
  useEffect(() => {
    if (!expanded) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      if (e.key === "Tab") {
        const items = [
          ...(expandedRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], [tabindex="0"]',
          ) ?? []),
        ].filter(
          (el) =>
            el.getClientRects().length &&
            el.tabIndex >= 0 &&
            getComputedStyle(el).visibility !== "hidden",
        );
        const first = items[0],
          last = items[items.length - 1];
        if (
          !expandedRef.current?.contains(document.activeElement) ||
          (!e.shiftKey && document.activeElement === last)
        ) {
          e.preventDefault();
          first?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      document.body.style.overflow = before;
    };
  }, [expanded]);
  // The API decides membership and ranking from complete visible interests.
  // Never re-filter people using actor.topConcepts: that field is capped at five.
  const people = atlasFor === interest ? (atlas?.suggestions ?? []) : [];
  const societies = communitySuggestions;
  const visible = audience === "societies" ? societies : people;
  const selected = visible.find((s) => s.actor.id === selectedId) ?? visible[0];
  const cards = (
    onlySaved ? visible.filter((s) => saved.includes(s.actor.id)) : visible
  ).slice(0, 3);
  const atlasPeople = useMemo(
    () =>
      visible.slice(0, ATLAS_LIMIT).map((s) => {
        const sharedConceptIds: string[] =
          "sharedConceptIds" in s && Array.isArray(s.sharedConceptIds)
            ? (s.sharedConceptIds as string[])
            : s.reasons.flatMap((r) =>
                r.kind === "shared_concept"
                  ? r.evidence
                      .filter((e) => e.kind === "concept")
                      .map((e) => e.id)
                  : [],
              );
        const groups = interests.flatMap((c, i) =>
          sharedConceptIds.includes(c.conceptId) ? [i] : [],
        );
        return {
          id: s.actor.id,
          name: s.actor.displayName,
          initials: initials(s.actor.displayName),
          groups,
          group: groups[0] ?? 0,
          sharedConceptIds,
          score: s.score,
        };
      }),
    [visible, interests],
  );
  const globeInterests = interests.map((c, i) => ({
    id: c.conceptId,
    label: c.label,
    color: INTEREST_COLORS[i % INTEREST_COLORS.length],
    count: c.count,
  }));
  const selectedSharedCount =
    selected &&
    "sharedConceptIds" in selected &&
    Array.isArray(selected.sharedConceptIds)
      ? selected.sharedConceptIds.length
      : (selected?.reasons.filter((r) => r.kind === "shared_concept").length ??
        0);
  const shownTotal =
    audience === "societies"
      ? visible.length
      : atlasFor === interest
        ? (atlas?.total ?? 0)
        : 0;
  const busy = audience === "societies" ? communityLoading : loading;
  const viewError = audience === "societies" ? communityError : error;
  function toggleSaved(id: string) {
    setSaved((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem("link.saved-connections", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  function changeInterest(id: string | null) {
    const next = new URLSearchParams(params);
    id ? next.set("interest", id) : next.delete("interest");
    setSelectedId(null);
    setParams(next, { replace: true });
  }

  return (
    <div className="discover-page">
      <section className="welcome-section">
        <div>
          <div className="eyebrow">PEOPLE / IDEAS / COMMON GROUND</div>
          <h1>
            Same campus.
            <br />
            <span>Different circles.</span>
          </h1>
          <p>Find people by what they study, work on, and want to build.</p>
        </div>
        <Link to="/network" className="campus-index-link">
          <span>ZOOM OUT</span>
          <strong>
            The whole campus <ArrowUpRight size={21} />
          </strong>
          <small>People, departments & interests</small>
        </Link>
      </section>
      <form
        className="discovery-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim())
            navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <Search size={21} strokeWidth={1.7} />
        <input
          aria-label="What are you curious about?"
          placeholder="Search a name, research interest, or department"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="search-submit">
          Find people <ArrowRight size={16} />
        </button>
      </form>
      <div className="suggested-searches">
        <span>Try a topic</span>
        {["Machine learning", "Robotics", "Computer vision"].map((q) => (
          <button
            key={q}
            onClick={() => navigate(`/search?q=${encodeURIComponent(q)}`)}
          >
            {q}
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
      <section className="network-section" aria-labelledby="network-title">
        <div className="section-heading">
          <div className="section-title">
            <h2 id="network-title">Your interest map</h2>
            <span className="count-badge">{atlas?.total ?? 0}</span>
          </div>
          <Link to="/network" className="text-link">
            Open database atlas <ArrowUpRight size={15} />
          </Link>
        </div>
        <div
          className="network-tabs"
          role="group"
          aria-label="Connection category"
        >
          <div>
            {(
              [
                {
                  value: "people",
                  label: "People",
                  count: atlas?.total ?? 0,
                  icon: Users,
                },
                {
                  value: "societies",
                  label: "Labs & clubs",
                  count: societies.length || undefined,
                  icon: Layers3,
                },
                {
                  value: "events",
                  label: "Events",
                  count: events.length,
                  icon: Compass,
                },
              ] as const
            ).map(({ value, label, count, icon: Icon }) => (
              <button
                className={audience === value ? "active" : ""}
                key={value}
                aria-pressed={audience === value}
                onClick={() => {
                  setAudience(value);
                  setSelectedId(null);
                }}
              >
                <Icon size={15} />
                {label}
                <small>{count}</small>
              </button>
            ))}
          </div>
          <span className="network-tabs-note">
            <span className="status-dot" />
            {audience === "societies"
              ? "Communities around your interests"
              : audience === "events"
                ? "Around your campus"
                : activeInterest
                  ? `Exploring ${activeInterest.label}`
                  : "People with shared interests"}
          </span>
        </div>
        {loading && !atlas ? (
          <div className="network-loading">
            <span className="loading-orbit" />
            <h3>Finding your connections</h3>
            <p>Matching your interests with the campus network.</p>
          </div>
        ) : error && !atlas ? (
          <div className="empty-state">
            <h3>Your campus could not be loaded</h3>
            <p>Check that the backend is running, then try again.</p>
            <button className="primary-button" onClick={load}>
              Try again
            </button>
          </div>
        ) : audience === "events" ? (
          <div className="events-preview">
            <div className="events-intro">
              <Compass size={30} />
              <h3>Take the connection offline.</h3>
              <p>
                {USING_FIXTURES
                  ? "A few sample campus events to explore."
                  : "Discover events around your interests."}
              </p>
            </div>
            {events.length ? (
              events.map((event) => (
                <button
                  key={event.event.id}
                  className="event-preview-card"
                  onClick={() => setSelectedEvent(event)}
                >
                  <span className="event-glyph">
                    <MoveUpRight size={23} />
                  </span>
                  <strong>{event.event.title}</strong>
                  <span>
                    Explore event <ArrowRight size={15} />
                  </span>
                </button>
              ))
            ) : (
              <p className="empty-state">No campus events are available yet.</p>
            )}
          </div>
        ) : (
          <div
            ref={expandedRef}
            className={`network-grid ${expanded ? "network-expanded" : ""}`}
            role={expanded ? "dialog" : undefined}
            aria-modal={expanded || undefined}
            aria-label={expanded ? "Expanded campus atlas" : undefined}
          >
            <div className="atlas-panel">
              <div className="atlas-heading">
                <div>
                  <span className="atlas-eyebrow">THE CAMPUS ATLAS</span>
                  <h3>
                    {audience === "people"
                      ? "Turn an interest into a connection."
                      : "Find a community for your curiosity."}
                  </h3>
                </div>
                <button
                  className="atlas-info-button icon-button"
                  onClick={() => setHelp(!help)}
                  aria-label="About the campus atlas"
                  aria-expanded={help}
                >
                  <CircleHelp size={18} />
                </button>
              </div>
              {help && (
                <div className="atlas-help">
                  <button
                    className="icon-button"
                    aria-label="Close atlas help"
                    onClick={() => setHelp(false)}
                  >
                    <X size={14} />
                  </button>
                  <strong>A new perspective on your network.</strong>
                  <p>
                    {audience === "people" &&
                      "Turn the sphere on the left to choose an interest. "}
                    Each node is one returned profile, with at most 12 shown.
                    Lines join profiles with a shared interest. Drag the network
                    to bring nearby names into focus; position is illustrative,
                    while the matching evidence comes from their profiles.
                  </p>
                </div>
              )}
              <div
                className={`atlas-explorer${audience === "societies" ? " atlas-explorer-communities" : ""}`}
              >
                {audience === "people" && (
                  <div className="interest-globe-rail">
                    <Suspense
                      fallback={
                        <div className="atlas-fallback-loading">
                          Opening your interest sphere…
                        </div>
                      }
                    >
                      <InterestGlobe
                        interests={globeInterests}
                        activeId={interest}
                        onChange={changeInterest}
                        still={still}
                      />
                    </Suspense>
                  </div>
                )}
                <div className="atlas-network-area" aria-busy={busy}>
                  <div className="atlas-view-caption">
                    <span>
                      {audience === "societies"
                        ? "Recommended communities"
                        : activeInterest
                          ? activeInterest.label
                          : "All your interests"}
                    </span>
                    <strong>
                      {busy
                        ? "Finding connections…"
                        : `${atlasPeople.length} of ${shownTotal} ${audience === "societies" ? "communities" : "people"}`}
                    </strong>
                  </div>
                  <div className="atlas-stage">
                    {viewError ? (
                      <div className="atlas-inline-state" role="alert">
                        <p>We couldn’t load these connections.</p>
                        <button className="text-link" onClick={load}>
                          Try again <ArrowRight size={14} />
                        </button>
                      </div>
                    ) : busy ? (
                      <div className="atlas-inline-state" role="status">
                        <span className="loading-orbit" />
                        <p>Finding your common ground…</p>
                      </div>
                    ) : atlasPeople.length === 0 ? (
                      <div className="atlas-inline-state">
                        <Users size={24} />
                        <p>No shared-interest matches here yet.</p>
                        <button
                          className="text-link"
                          onClick={() => changeInterest(null)}
                        >
                          Explore all interests <ArrowRight size={14} />
                        </button>
                      </div>
                    ) : (
                      <Suspense
                        fallback={
                          <div className="atlas-fallback-loading">
                            Opening your connections…
                          </div>
                        }
                      >
                        <NetworkAtlas
                          people={atlasPeople}
                          selectedId={selected?.actor.id ?? null}
                          onSelect={setSelectedId}
                          activeGroup={
                            audience === "societies" || activeGroup < 0
                              ? null
                              : activeGroup
                          }
                          still={still}
                          zoom={zoom}
                        />
                      </Suspense>
                    )}
                  </div>
                  <p className="atlas-depth-note">
                    Closer names come into focus. Drag to see who’s behind.
                  </p>
                </div>
              </div>
              <div className="atlas-footer">
                <span>
                  <span className="drag-icon">⌘</span> Each node is a{" "}
                  {audience === "societies" ? "community" : "person"} · Lines
                  are shared interests
                </span>
                <div className="atlas-controls">
                  <button
                    className="icon-button"
                    aria-label={
                      still ? "Enable atlas motion" : "Pause atlas motion"
                    }
                    aria-pressed={still}
                    onClick={() => setStill(!still)}
                  >
                    {still ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <span />
                  <button
                    className="icon-button"
                    aria-label="Zoom out"
                    disabled={zoom <= 0.75}
                    onClick={() => setZoom((z) => Math.max(0.75, z - 0.15))}
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Zoom in"
                    disabled={zoom >= 1.6}
                    onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
                  >
                    <Plus size={15} />
                  </button>
                  <span />
                  <button
                    className="icon-button"
                    aria-label={
                      expanded ? "Close expanded atlas" : "Expand atlas"
                    }
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? (
                      <Minimize2 size={15} />
                    ) : (
                      <Maximize2 size={15} />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <aside
              className="connection-spotlight"
              aria-label="Selected connection"
              aria-live="polite"
            >
              {selected && !busy && !viewError ? (
                <>
                  <div className="spotlight-eyebrow">
                    <Link2 size={14} />
                    <span>SELECTED PROFILE</span>
                  </div>
                  <div className="spotlight-profile">
                    <div className="spotlight-avatar-wrap">
                      <Avatar
                        name={selected.actor.displayName}
                        size="lg"
                        index={people.findIndex(
                          (p) => p.actor.id === selected.actor.id,
                        )}
                      />
                    </div>
                    <h3>{selected.actor.displayName}</h3>
                    <p>
                      {selected.actor.homeUnit?.name ?? selected.actor.kind}
                      <span> · </span>
                      {selected.actor.personKind ?? "Campus community"}
                    </p>
                  </div>
                  <div className="shared-pill">
                    <span className="overlap-circles" />
                    {selectedSharedCount > 0
                      ? `${selectedSharedCount} shared ${selectedSharedCount === 1 ? "interest" : "interests"}`
                      : "Shared campus context"}
                  </div>
                  <div className="why-connect">
                    <h4>Shared ground</h4>
                    <p>
                      {selected.reasons[0]?.prose ??
                        selected.reasons[0]?.summary ??
                        "Explore their interests to see what you could build together."}
                      .
                      {selected.reasons[1]
                        ? ` ${selected.reasons[1].summary}.`
                        : " A little common ground is a good place to start."}
                    </p>
                  </div>
                  <div className="spotlight-tags">
                    {selected.actor.topConcepts.slice(0, 2).map((c) => (
                      <span key={c.conceptId}>{c.label}</span>
                    ))}
                  </div>
                  <button
                    className="primary-button spotlight-action"
                    onClick={() => setDetail(selected)}
                  >
                    {selected.actor.kind === "person"
                      ? `Meet ${selected.actor.displayName.split(" ")[0]}`
                      : "Explore this community"}
                    <ArrowUpRight size={17} />
                  </button>
                  <span className="spotlight-footnote">
                    Based on visible profile interests.
                  </span>
                </>
              ) : (
                <div className="empty-state">
                  <Users size={28} />
                  <h3>
                    {busy
                      ? "A new perspective is on its way."
                      : "Make room for new connections."}
                  </h3>
                  <p>
                    {busy
                      ? "Finding your common ground…"
                      : viewError
                        ? "Retry to load these connections."
                        : "No matches here yet."}
                  </p>
                  <button
                    className="text-link"
                    onClick={() => changeInterest(null)}
                  >
                    See all interests <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </aside>
          </div>
        )}
        {audience === "people" && (
          <div className="interest-filters">
            <span>Explore by interest</span>
            <button
              aria-pressed={!interest}
              className={!interest ? "active" : ""}
              onClick={() => changeInterest(null)}
            >
              All interests
            </button>
            {interests.slice(0, 5).map((c, i) => (
              <button
                key={c.conceptId}
                className={interest === c.conceptId ? "active" : ""}
                aria-pressed={interest === c.conceptId}
                onClick={() =>
                  changeInterest(interest === c.conceptId ? null : c.conceptId)
                }
              >
                <span className={`interest-dot dot-${i}`} />
                {c.label.charAt(0).toUpperCase() + c.label.slice(1)}
              </button>
            ))}
          </div>
        )}
      </section>
      {audience !== "events" && (
        <section className="people-section" aria-labelledby="people-title">
          <div className="section-heading">
            <div>
              <h2 id="people-title">
                {audience === "societies"
                  ? "Find a community for your curiosity"
                  : "Start a conversation"}
              </h2>
              <p>
                {audience === "people" && activeInterest
                  ? `People who share your interest in ${activeInterest.label}.`
                  : "The closest matches from your interest map."}
              </p>
            </div>
            <button
              className={`saved-filter text-link ${onlySaved ? "active" : ""}`}
              onClick={() => setOnlySaved(!onlySaved)}
              aria-pressed={onlySaved}
            >
              <Bookmark size={15} fill={onlySaved ? "currentColor" : "none"} />
              {onlySaved ? "Showing saved" : "Saved"}
              {saved.length > 0 && <span>{saved.length}</span>}
            </button>
          </div>
          <div className="person-cards">
            {!busy &&
              !viewError &&
              cards.map((s, i) => (
                <article className="connection-card" key={s.actor.id}>
                  <div className="connection-card-top">
                    <Avatar name={s.actor.displayName} index={i + 1} />
                    <button
                      className={`icon-button bookmark-button ${saved.includes(s.actor.id) ? "is-saved" : ""}`}
                      aria-label={`${saved.includes(s.actor.id) ? "Unsave" : "Save"} ${s.actor.displayName}`}
                      aria-pressed={saved.includes(s.actor.id)}
                      onClick={() => toggleSaved(s.actor.id)}
                    >
                      <Bookmark
                        size={17}
                        fill={
                          saved.includes(s.actor.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                  <h3>{s.actor.displayName}</h3>
                  <p className="person-meta">
                    {s.actor.homeUnit?.name ?? "Campus community"} ·{" "}
                    {s.actor.personKind ?? s.actor.kind}
                  </p>
                  <p className="connection-reason">
                    <span className="small-link-mark">↗</span>
                    {s.reasons[0]?.summary ??
                      "A new perspective in your network"}
                  </p>
                  <div className="connection-card-bottom">
                    <span className="person-interest">
                      {s.actor.topConcepts[0]?.label ?? "New connection"}
                    </span>
                    <button
                      aria-label={`Meet ${s.actor.displayName}`}
                      onClick={() => setDetail(s)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {cards.length === 0 && !busy && (
            <div className="empty-state">
              <Bookmark size={24} />
              <h3>
                {onlySaved
                  ? "Keep a connection in mind."
                  : "Your next connection is out there."}
              </h3>
              <p>
                {onlySaved
                  ? "Save a profile using its bookmark, then find it here."
                  : "Try another interest to discover more people."}
              </p>
              <button
                className="text-link"
                onClick={() => {
                  setOnlySaved(false);
                  changeInterest(null);
                }}
              >
                Explore connections <ArrowRight size={16} />
              </button>
            </div>
          )}
        </section>
      )}
      <footer className="discover-footer">
        <span>
          <Network size={15} /> Link / Campus discovery
        </span>
        <Link to="/settings">
          Made around your interests <ChevronRight size={13} />
        </Link>
      </footer>
      {detail && (
        <PersonPanel
          key={detail.actor.id}
          actor={detail.actor}
          reasons={detail.reasons}
          onClose={() => setDetail(null)}
        />
      )}
      {selectedEvent && (
        <EventPanel
          event={selectedEvent.event}
          reasons={selectedEvent.reasons}
          demo={USING_FIXTURES}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
