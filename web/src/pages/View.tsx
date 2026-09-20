import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Layers3,
  Link2,
  Search,
  Users,
  X,
} from "lucide-react";
import { api, USING_FIXTURES } from "../api/client";
import { Avatar } from "../components/Avatar";
import { PersonPanel } from "../components/PersonPanel";
import type { ConnectionSuggestion } from "../types/api";
import "../styles/connections.css";

const SAVED_KEY = "link.saved-connections";
const PAGE_SIZE = 12;
function readSaved(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function View() {
  const [suggestions, setSuggestions] = useState<ConnectionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | "people" | "groups">("all");
  const [onlySaved, setOnlySaved] = useState(false);
  const [saved, setSaved] = useState(readSaved);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .getSuggestions(50)
      .then((items) => {
        if (!cancelled) setSuggestions(items);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  useEffect(() => {
    const sync = () => setSaved(readSaved());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  function toggleSaved(id: string) {
    setSaved((previous) => {
      const next = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        /* Available for this visit if storage is blocked. */
      }
      return next;
    });
  }
  function resetFilters() {
    setQuery("");
    setCategory("all");
    setOnlySaved(false);
    setVisibleCount(PAGE_SIZE);
  }
  const peopleCount = suggestions.filter(
    ({ actor }) => actor.kind === "person",
  ).length;
  const groupsCount = suggestions.length - peopleCount;
  const savedCount = suggestions.filter(({ actor }) =>
    saved.includes(actor.id),
  ).length;
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = suggestions.filter(({ actor }) => {
    if (onlySaved && !saved.includes(actor.id)) return false;
    if (category === "people" && actor.kind !== "person") return false;
    if (category === "groups" && actor.kind === "person") return false;
    const searchable = [
      actor.displayName,
      actor.homeUnit?.name,
      actor.personKind,
      actor.kind,
      ...actor.topConcepts.map((concept) => concept.label),
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => searchable.includes(word));
  });
  const selected = suggestions.find(({ actor }) => actor.id === selectedId);

  return (
    <div className="connections-page">
      <header className="connections-intro">
        <div>
          <div className="eyebrow">GOOD IDEAS NEED GOOD COMPANY</div>
          <h1>
            Your connections<span>.</span>
          </h1>
          <p>
            Find a familiar interest. Meet a different perspective.
            <br className="connections-desktop-break" /> Keep the people and
            communities you want to explore in one place.
          </p>
        </div>
        <div className="connections-intro-mark" aria-hidden="true">
          <Users size={25} strokeWidth={1.4} />
          <span />
          <span />
        </div>
      </header>
      <div className="connections-toolbar">
        <div className="connections-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search a name, interest, or community"
            aria-label="Search connections by name or interest"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setVisibleCount(PAGE_SIZE);
              }}
              aria-label="Clear connection search"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`connections-saved-toggle ${onlySaved ? "is-active" : ""}`}
          aria-pressed={onlySaved}
          onClick={() => {
            setOnlySaved(!onlySaved);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <Bookmark size={16} fill={onlySaved ? "currentColor" : "none"} />
          Saved only<span>{savedCount}</span>
        </button>
      </div>
      <div className="connections-filter-row">
        <div
          className="connections-categories"
          role="group"
          aria-label="Connection type"
        >
          {(
            [
              {
                value: "all",
                label: "All connections",
                count: suggestions.length,
                Icon: Link2,
              },
              {
                value: "people",
                label: "People",
                count: peopleCount,
                Icon: Users,
              },
              {
                value: "groups",
                label: "Labs & clubs",
                count: groupsCount,
                Icon: Layers3,
              },
            ] as const
          ).map(({ value, label, count, Icon }) => (
            <button
              type="button"
              key={value}
              className={category === value ? "is-active" : ""}
              aria-pressed={category === value}
              onClick={() => {
                setCategory(value);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <p className="connections-result-count" role="status">
          {loading
            ? "Loading connections…"
            : error
              ? "Connections unavailable"
              : `${filtered.length} ${filtered.length === 1 ? "connection" : "connections"}${onlySaved ? " saved" : " to explore"}`}
        </p>
      </div>
      {loading ? (
        <div className="connections-loading" role="status">
          <div className="connections-loading-mark">
            <Users size={23} />
          </div>
          <h2>Finding your common ground.</h2>
          <p>Loading people and communities around your interests.</p>
        </div>
      ) : error ? (
        <div className="connections-empty" role="alert">
          <Users size={26} />
          <h2>Your connections could not be loaded.</h2>
          <p>Check that the backend is running, then try again.</p>
          <button
            className="primary-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="connections-empty">
          <Bookmark size={26} />
          <h2>
            {onlySaved && !query
              ? "Keep a connection in mind."
              : "No connections match these filters."}
          </h2>
          <p>
            {onlySaved && !query
              ? "Use a profile’s bookmark to save it here for later."
              : "Try another name or interest, or explore all your connections."}
          </p>
          <button className="primary-button" onClick={resetFilters}>
            Explore all connections <ArrowUpRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="connections-grid">
            {filtered.slice(0, visibleCount).map((suggestion, index) => {
              const { actor, reasons } = suggestion;
              const isSaved = saved.includes(actor.id);
              return (
                <article className="connections-card" key={actor.id}>
                  <div className="connections-card-heading">
                    <Avatar name={actor.displayName} index={index} />
                    <button
                      type="button"
                      className={`connections-bookmark ${isSaved ? "is-active" : ""}`}
                      onClick={() => toggleSaved(actor.id)}
                      aria-label={`${isSaved ? "Unsave" : "Save"} ${actor.displayName}`}
                      aria-pressed={isSaved}
                    >
                      <Bookmark
                        size={17}
                        fill={isSaved ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                  <h2>{actor.displayName}</h2>
                  <p className="connections-profile-meta">
                    {actor.personKind ?? actor.kind}
                    {actor.homeUnit?.name ? ` · ${actor.homeUnit.name}` : ""}
                  </p>
                  <div className="connections-evidence">
                    <Link2 size={14} aria-hidden="true" />
                    <p>
                      {reasons[0]?.summary ??
                        "Explore their interests to find your common ground."}
                    </p>
                  </div>
                  <div className="connections-topics">
                    {actor.topConcepts.slice(0, 3).map((concept) => (
                      <span key={concept.conceptId}>{concept.label}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="connections-open"
                    aria-label={`Explore ${actor.displayName}'s profile`}
                    onClick={() => setSelectedId(actor.id)}
                  >
                    Explore profile <ArrowUpRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
          {visibleCount < filtered.length && (
            <div className="connections-load-more">
              <p>
                Showing {Math.min(visibleCount, filtered.length)} of{" "}
                {filtered.length} connections
              </p>
              <button
                className="connections-more-button"
                onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}
              >
                Show more connections
              </button>
            </div>
          )}
        </>
      )}
      <footer className="connections-note">
        <Bookmark size={14} aria-hidden="true" />
        <p>
          Bookmarks stay in this browser.
          {USING_FIXTURES
            ? " You’re exploring sample profiles in the local demo."
            : " Open a profile to see what connects you."}
        </p>
      </footer>
      {selected && (
        <PersonPanel
          key={selected.actor.id}
          actor={selected.actor}
          reasons={selected.reasons}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
