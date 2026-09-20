import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
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
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { api, USING_FIXTURES } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Avatar, initials } from "../components/Avatar";
import { PersonPanel } from "../components/PersonPanel";
import { EventPanel } from "../components/EventPanel";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { ConnectionSuggestion, EventSuggestion } from "../types/api";
const NetworkAtlas = lazy(() =>
  import("../components/NetworkAtlas").then((m) => ({
    default: m.NetworkAtlas,
  })),
);

export function Home() {
  const { actor } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [suggestions, setSuggestions] = useState<ConnectionSuggestion[]>([]);
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
  const interests = actor?.topConcepts ?? [];
  const interest = params.get("interest");
  const activeGroup = interests.findIndex((c) => c.conceptId === interest);
  function load() {
    setLoading(true);
    setError(false);
    Promise.all([api.getSuggestions(50), api.getEventSuggestions()])
      .then(([s, e]) => {
        setSuggestions(s);
        setEvents(e);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => {
    if (!expanded) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      if (e.key === "Tab") {
        const items = [
          ...(expandedRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href]",
          ) ?? []),
        ].filter(
          (el) =>
            el.getClientRects().length &&
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
  const people = suggestions.filter((s) => s.actor.kind === "person");
  const societies = suggestions.filter((s) => s.actor.kind !== "person");
  const visible = (audience === "societies" ? societies : people).filter(
    (s) =>
      !interest || s.actor.topConcepts.some((c) => c.conceptId === interest),
  );
  const selected =
    visible.find((s) => s.actor.id === selectedId) ??
    visible.find(
      (s) => s.reasons.filter((r) => r.kind === "shared_concept").length > 1,
    ) ??
    visible[0];
  const cards = (
    onlySaved ? visible.filter((s) => saved.includes(s.actor.id)) : visible
  ).slice(0, 3);
  const atlasPeople = useMemo(
    () =>
      (audience === "societies"
        ? suggestions.filter((s) => s.actor.kind !== "person")
        : suggestions.filter((s) => s.actor.kind === "person")
      ).map((s) => ({
        id: s.actor.id,
        name: s.actor.displayName,
        initials: initials(s.actor.displayName),
        groups: interests.flatMap((c, i) =>
          s.actor.topConcepts.some((a) => a.conceptId === c.conceptId)
            ? [i]
            : [],
        ),
        group: Math.max(
          0,
          interests.findIndex((c) =>
            s.actor.topConcepts.some((a) => a.conceptId === c.conceptId),
          ),
        ),
      })),
    [suggestions, audience, actor],
  );
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
    setParams(next);
  }

  return (
    <div className="discover-page">
      <section className="welcome-section">
        <div>
          <div className="eyebrow">
            <span className="tiny-spark">✳</span> A WORLD OF PEOPLE, A LITTLE
            CLOSER
          </div>
          <h1>
            Your next great idea
            <br />
            starts with <span>a connection.</span>
          </h1>
          <p>
            Find your people. Share your curiosity. Build something together.
          </p>
        </div>
        <div className="welcome-note">
          <div className="mini-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span>
            Different minds.
            <br />
            <strong>Shared possibilities.</strong>
          </span>
        </div>
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
          placeholder="What are you curious about? Find people, interests, or ideas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="search-submit">
          Find my people <ArrowRight size={16} />
        </button>
      </form>
      <div className="suggested-searches">
        <span>A little inspiration:</span>
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
            <h2 id="network-title">Your world of connections</h2>
            <span className="count-badge">{suggestions.length}</span>
          </div>
          <Link to="/view" className="text-link">
            Explore all <ArrowUpRight size={15} />
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
                  count: people.length,
                  icon: Users,
                },
                {
                  value: "societies",
                  label: "Labs & clubs",
                  count: societies.length,
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
            Based on your shared interests
          </span>
        </div>
        {loading ? (
          <div className="network-loading">
            <span className="loading-orbit" />
            <h3>Finding your connections</h3>
            <p>A few shared interests can open a whole new world.</p>
          </div>
        ) : error ? (
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
                  <h3>Follow your curiosity.</h3>
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
                    Drag to explore. Select a name to see what connects you.
                    Positions are illustrative; the evidence panel explains each
                    match.
                  </p>
                </div>
              )}
              <div className="atlas-stage">
                <Suspense
                  fallback={
                    <div className="atlas-fallback-loading">
                      Opening your atlas…
                    </div>
                  }
                >
                  <NetworkAtlas
                    people={atlasPeople}
                    selectedId={selected?.actor.id ?? null}
                    onSelect={(id) => {
                      const person = suggestions.find((s) => s.actor.id === id);
                      if (
                        person &&
                        interest &&
                        !person.actor.topConcepts.some(
                          (c) => c.conceptId === interest,
                        )
                      )
                        changeInterest(null);
                      setSelectedId(id);
                    }}
                    activeGroup={activeGroup < 0 ? null : activeGroup}
                    still={still}
                    zoom={zoom}
                  />
                </Suspense>
              </div>
              <div className="atlas-footer">
                <span>
                  <span className="drag-icon">⌘</span> Drag to explore · Click
                  to connect
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
              {selected ? (
                <>
                  <div className="spotlight-eyebrow">
                    <Sparkles size={14} />
                    <span>A CONNECTION WORTH EXPLORING</span>
                  </div>
                  <div className="spotlight-profile">
                    <div className="spotlight-avatar-wrap">
                      <Avatar
                        name={selected.actor.displayName}
                        size="lg"
                        index={people.indexOf(selected)}
                      />
                      <span className="profile-spark">
                        <Sparkles size={12} />
                      </span>
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
                    {selected.reasons.filter((r) => r.kind === "shared_concept")
                      .length > 0
                      ? `${selected.reasons.filter((r) => r.kind === "shared_concept").length} shared ${selected.reasons.filter((r) => r.kind === "shared_concept").length === 1 ? "interest" : "interests"}`
                      : "Shared campus context"}
                  </div>
                  <div className="why-connect">
                    <h4>Why you two?</h4>
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
                    Good conversations start with common ground.
                  </span>
                </>
              ) : (
                <div className="empty-state">
                  <Users size={28} />
                  <h3>Make room for new connections.</h3>
                  <p>No matches for this interest yet.</p>
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
        {audience !== "events" && (
          <div className="interest-filters">
            <span>Explore by interest</span>
            <button
              aria-pressed={!interest}
              className={!interest ? "active" : ""}
              onClick={() => changeInterest(null)}
            >
              All interests
            </button>
            {interests.slice(0, 4).map((c, i) => (
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
                  : "A few people you should meet"}
              </h2>
              <p>
                Shared interests. Fresh perspectives. Something worth starting.
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
            {cards.map((s, i) => (
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
                  {s.reasons[0]?.summary ?? "A new perspective in your network"}
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
          {cards.length === 0 && !loading && (
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
          <Network size={15} /> Small connections. Big possibilities.
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
