import type {
  ActorSummary,
  AtlasResponse,
  NetworkDirectoryResponse,
  BridgeSuggestion,
  CourseOffering,
  EventSuggestion,
  ImportKind,
  ImportSummary,
  AskSummary,
  AspirationMatch,
  SmartSearchResult,
  ConnectionSuggestion,
  Cursor,
  InterestRow,
  Reason,
  Stance,
  Visibility,
} from "../types/api";
import { fixtures } from "../home/fixtures";

const BASE = "/api";

/**
 * Fixture mode. The real stack needs Postgres and Ollama, so `?fixtures=1` (or
 * VITE_FIXTURES=1 at build time) swaps the whole client for a canned dataset.
 * The switch lives here and nowhere else: AuthContext, the route guard and
 * every page work unmodified, and the production path is one early branch.
 */
export const USING_FIXTURES: boolean = (() => {
  try {
    if (new URLSearchParams(window.location.search).get("fixtures") === "1") return true;
  } catch {
    // No window (SSR, a test runner) — fall through to the build-time flag.
  }
  return import.meta.env.VITE_FIXTURES === "1";
})();

// credentials: 'include' so the signed session cookie rides along —
// without it every request behind requireSession would 401.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `POST ${path}`));
  return res.json() as Promise<T>;
}

// Import rejections carry a message the person needs to read ("that PDF has
// no text layer"), so it is preserved rather than flattened to a status code.
async function errorMessage(res: Response, prefix: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // Non-JSON error body — fall through to the status line.
  }
  return `${prefix} failed: ${res.status}`;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AuthMeResponse {
  actor?: ActorSummary;
  authMode: "demo" | "real";
}

const realApi = {
  // "me" is accepted as a literal path segment server-side and resolved
  // from the session — the frontend never needs to know its own actor id.
  getActor: () => get<ActorSummary>(`/actors/me`),

  async getNetwork(signal?: AbortSignal): Promise<NetworkDirectoryResponse> {
    const res = await fetch(`${BASE}/network`, { credentials: "include", signal });
    if (!res.ok) throw new Error(await errorMessage(res, "GET /network"));
    return res.json() as Promise<NetworkDirectoryResponse>;
  },

  async getAtlas(conceptId?: string, limit = 12, signal?: AbortSignal): Promise<AtlasResponse> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (conceptId) query.set("conceptId", conceptId);
    const res = await fetch(`${BASE}/actors/me/atlas?${query}`, { credentials: "include", signal });
    if (!res.ok) throw new Error(await errorMessage(res, "GET /actors/me/atlas"));
    return res.json() as Promise<AtlasResponse>;
  },

  // Neither of these has an endpoint yet. They resolve empty rather than
  // throwing, so against the live backend the home page renders the real
  // graph with those two layers simply absent — never with invented data.
  getBridges: async (): Promise<BridgeSuggestion[]> => [],
  getEventSuggestions: async (): Promise<EventSuggestion[]> => [],
  getActorSettings: () => get<ActorSummary & { discoverable: boolean }>(`/actors/me/settings`),
  getSuggestions: (limit?: number) =>
    get<ConnectionSuggestion[]>(`/actors/me/suggestions${limit ? `?limit=${limit}` : ""}`),
  getConnection: (otherId: string) => get<Reason[]>(`/actors/me/connections/${otherId}`),
  getConceptActors: (conceptId: string) => get<ActorSummary[]>(`/concepts/${conceptId}/actors`),
  listAsks: (cursor?: string) => get<Cursor<AskSummary>>(`/asks${cursor ? `?cursor=${cursor}` : ""}`),
  createAsk: (text: string) => post<{ id: string }>("/asks", { text }),
  // Phase 1 is instant; ai=true asks the local model to refine (resolves null when
  // it has nothing to add — the caller keeps what it already has).
  async searchSmart(q: string, ai = false, signal?: AbortSignal): Promise<SmartSearchResult | null> {
    const res = await fetch(`${BASE}/search/smart?q=${encodeURIComponent(q)}${ai ? "&ai=1" : ""}`, { credentials: "include", signal });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(await errorMessage(res, "GET /search/smart"));
    return res.json() as Promise<SmartSearchResult>;
  },
  // AI descriptions for the top results (best effort: null when the model has nothing grounded to say).
  async searchBlurbs(q: string, ids: string[], signal?: AbortSignal): Promise<Record<string, string> | null> {
    const res = await fetch(`${BASE}/search/blurbs?q=${encodeURIComponent(q)}&ids=${ids.join(",")}`, { credentials: "include", signal });
    if (res.status === 204 || !res.ok) return null;
    return ((await res.json()) as { blurbs: Record<string, string> }).blurbs;
  },
  searchAspirations: (q: string) => get<AspirationMatch[]>(`/search/aspirations?q=${encodeURIComponent(q)}`),
  postInterest: (rawText: string, stance: Stance) => post<{ ok: true }>("/me/interests", { rawText, stance }),
  setDiscoverable: (discoverable: boolean) => patch<ActorSummary>(`/actors/me`, { discoverable }),
  listInterests: () => get<InterestRow[]>(`/actors/me/interests`),
  setInterestVisibility: (interestId: string, visibility: Visibility) =>
    patch<{ ok: true }>(`/actors/me/interests/${interestId}`, { visibility }),

  // Onboarding/imports run before a session exists — see the imports
  // router, which is mounted ahead of requireSession for exactly this
  // reason — so these still pass actorId explicitly rather than relying on
  // the session, unlike everything above.
  createActor: (displayName: string) => post<ActorSummary>("/actors", { displayName }),
  getCourseCatalog: () => get<CourseOffering[]>("/courses/catalog"),
  listImports: (actorId: string) => get<ImportSummary[]>(`/me/imports?actorId=${actorId}`),
  // Accepted immediately (202); the import runs on the worker and its
  // progress is read back from listImports.
  createImport: (body: {
    actorId: string;
    kind: ImportKind;
    origin?: string;
    text?: string;
    filename?: string;
    contentBase64?: string;
    courses?: CourseOffering[];
  }) => post<{ id: string }>("/me/imports", body),

  // Auth — these read the JSON body regardless of status code, since the
  // login page needs the error message (or authMode) either way.
  async me(): Promise<{ status: number; body: AuthMeResponse }> {
    const res = await fetch(`${BASE}/auth/me`, { credentials: "include" });
    return { status: res.status, body: await res.json() };
  },
  async login(
    username: string,
    password: string,
  ): Promise<{ status: number; body: AuthMeResponse & { error?: string } }> {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return { status: res.status, body: await res.json() };
  },
  async logout(): Promise<void> {
    await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" });
  },
};

// ---- Fixture client --------------------------------------------------------
// Same surface, resolved from the sample dataset. Only browser-local settings
// are persisted; they never imply that a server received a change.
const FIXTURE_SETTINGS_KEY = "link.demo.settings.v1";
const fixtureInterests = fixtures.interests.map((interest) => ({ ...interest }));
let fixtureDiscoverable = true;

if (USING_FIXTURES) {
  try {
    const saved = JSON.parse(localStorage.getItem(FIXTURE_SETTINGS_KEY) ?? "null");
    if (typeof saved?.discoverable === "boolean") fixtureDiscoverable = saved.discoverable;
    if (Array.isArray(saved?.interests) && saved.interests.every((row: InterestRow) =>
      row && typeof row.id === "string" && typeof row.rawText === "string" &&
      ["established", "exploring", "aspiring"].includes(row.stance) &&
      ["public", "institution", "private"].includes(row.visibility) &&
      typeof row.resolved === "boolean" &&
      (row.conceptId === null || typeof row.conceptId === "string") &&
      (row.conceptLabel === null || typeof row.conceptLabel === "string"),
    )) fixtureInterests.splice(0, fixtureInterests.length, ...saved.interests);
  } catch {
    // Storage can be unavailable or stale; the sample still works in memory.
  }
}

function saveFixtureSettings() {
  try {
    localStorage.setItem(FIXTURE_SETTINGS_KEY, JSON.stringify({ interests: fixtureInterests, discoverable: fixtureDiscoverable }));
  } catch {
    // Private browsing or a full quota should not prevent trying the preview.
  }
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const QUERY_WORDS = new Set("a an the and or i me my to in on of for with who that people person someone find looking interested interest want wants build builds learn learning study studies help teammate teammates collaborator collaborators work working does do is are can would like".split(" "));
const TOPIC_ALIASES: Record<string, RegExp> = {
  "c-ml": /\b(ai|artificial intelligence|machine learning|ml|neural networks?|deep learning|data science)\b/,
  "c-cv": /\b(computer vision|vision|image recognition|perception)\b/,
  "c-rob": /\b(robotics|robots?|autonomous systems?|automation)\b/,
  "c-crypt": /\b(cryptography|cryptographic|encryption|cybersecurity|security)\b/,
  "c-hci": /\b(human computer interaction|human centered|hci|ux|user experience|interfaces?|design)\b/,
  "c-net": /\b(computer networks?|networking|networks?)\b/,
  "c-se": /\b(software engineering|software|coding|codes?|programming|developer|developers|open source)\b/,
  "c-db": /\b(database systems?|databases?|sql|data storage)\b/,
};

/** Transparent keyword/alias matching over sample evidence, with no model call. */
function searchFixtures(query: string): SmartSearchResult {
  const normalized = normalize(query);
  const tokens = normalized.split(" ").filter((token) => token.length > 1 && !QUERY_WORDS.has(token));
  const entries = [...fixtures.people, ...fixtures.societies];
  const concepts = [...new Map(entries.flatMap(({ actor }) => actor.topConcepts.map((concept) => [concept.conceptId, concept] as const))).values()];
  const topics = concepts.filter((concept) =>
    normalized.length > 0 && (TOPIC_ALIASES[concept.conceptId]?.test(normalized) || normalized.includes(normalize(concept.label))),
  );
  const topicIds = new Set(topics.map((topic) => topic.conceptId));
  const matchesName = (actor: ActorSummary) => tokens.length > 0 && tokens.every((token) =>
    normalize(actor.displayName).split(" ").some((word) => word === token || (token.length >= 3 && word.startsWith(token))),
  );
  const matches = entries.map((entry) => {
    const matched = entry.actor.topConcepts.filter((concept) => topicIds.has(concept.conceptId))
      .map((concept) => ({ conceptId: concept.conceptId, label: concept.label, note: "Listed on this sample profile" }));
    const contextReasons = entry.reasons.filter((reason) => reason.kind === "shared_context" &&
      tokens.length > 0 && tokens.every((token) => normalize(reason.summary).includes(token)));
    const byName = matchesName(entry.actor);
    const reasons: Reason[] = matched.map((concept) => ({
      kind: "shared_concept",
      summary: `Lists ${concept.label} as an interest`,
      evidence: [{ kind: "concept", id: concept.conceptId, label: concept.label }],
    }));
    return { ...entry, matched, reasons: [...reasons, ...contextReasons], score: matched.length * 10 + (byName ? 20 : 0) + contextReasons.length * 5 };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.actor.id.localeCompare(b.actor.id));
  const people: SmartSearchResult["people"] = matches.filter(({ actor }) => actor.kind === "person").map((entry) => ({
    actor: entry.actor,
    matchKind: entry.actor.personKind === "faculty" ? "mentor" : "peer",
    score: entry.score,
    reasons: entry.reasons,
    matched: entry.matched,
    facetsMatched: entry.matched.length,
  }));
  const groups: SmartSearchResult["groups"] = matches.flatMap((entry) => {
    const groupKind = entry.actor.kind;
    return groupKind === "club" || groupKind === "lab" || groupKind === "department"
      ? [{ actor: entry.actor, groupKind, score: entry.score, matched: entry.matched, members: 0 }]
      : [];
  });
  return {
    query, correctedQuery: null,
    interpretation: "Local preview: matching sample profiles by listed topics, names, and shared contexts.",
    refined: false,
    facets: topics.map((topic) => ({ name: topic.label, topics: [{ conceptId: topic.conceptId, label: topic.label, weight: 1, kind: "match" }] })),
    people, totalPeople: people.length, groups,
    nameMatches: entries.filter(({ actor }) => matchesName(actor)).map(({ actor }) => actor),
    unmatchedFacets: [], timingsMs: {},
  };
}

/** A small delay on reads, so loading states are exercised rather than skipped. */
const settle = <T>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const fixtureApi: typeof realApi = {
  getActor: () => settle(fixtures.viewer),
  async getNetwork(signal?: AbortSignal): Promise<NetworkDirectoryResponse> {
    if (signal?.aborted) throw new DOMException("Network request cancelled", "AbortError");
    // Loaded only when the database atlas is opened. This is an export of the
    // repository's synthetic seed data, never a fallback for a failed API call.
    const { default: snapshot } = await import("../home/network-snapshot.json");
    if (signal?.aborted) throw new DOMException("Network request cancelled", "AbortError");
    return snapshot as NetworkDirectoryResponse;
  },
  async getAtlas(conceptId?: string, limit = 12, signal?: AbortSignal): Promise<AtlasResponse> {
    if (signal?.aborted) throw new DOMException("Atlas request cancelled", "AbortError");
    const interestMap = new Map(fixtureInterests
      .filter((interest) => interest.resolved && interest.conceptId && interest.conceptLabel && interest.visibility !== "private")
      .map((interest) => [interest.conceptId!, { conceptId: interest.conceptId!, label: interest.conceptLabel!, count: 0 }]));
    const ranked = fixtures.people.map((suggestion) => ({
      ...suggestion,
      sharedConceptIds: suggestion.actor.topConcepts.map((concept) => concept.conceptId).filter((id) => interestMap.has(id)),
      // Match the server's privacy-aware scorer after demo settings change.
      reasons: suggestion.reasons.filter((reason) => reason.kind !== "shared_concept" ||
        reason.evidence.every((evidence) => evidence.kind !== "concept" || interestMap.has(evidence.id))),
    })).filter((suggestion) => suggestion.sharedConceptIds.length > 0)
      .sort((a, b) => b.score - a.score);
    for (const suggestion of ranked) {
      for (const id of suggestion.sharedConceptIds) interestMap.get(id)!.count++;
    }
    const matching = conceptId ? ranked.filter((suggestion) => suggestion.sharedConceptIds.includes(conceptId)) : ranked;
    const selected = conceptId ? interestMap.get(conceptId) : undefined;
    const suggestions = matching.slice(0, Math.min(24, Math.max(1, Math.floor(limit)))).map((suggestion) => {
      if (!selected) return suggestion;
      const reason: Reason = {
        kind: "shared_concept",
        summary: `Both interested in ${selected.label}`,
        evidence: [{ kind: "concept", id: selected.conceptId, label: selected.label }],
      };
      return { ...suggestion, reasons: [reason, ...suggestion.reasons.filter((entry) =>
        !entry.evidence.some((evidence) => evidence.kind === "concept" && evidence.id === selected.conceptId),
      )].slice(0, 3) };
    });
    const result = await settle({
      interests: [...interestMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      suggestions,
      total: matching.length,
    });
    if (signal?.aborted) throw new DOMException("Atlas request cancelled", "AbortError");
    return result;
  },
  getBridges: () => settle(fixtures.bridges),
  getEventSuggestions: () => settle(fixtures.events),
  getActorSettings: () => settle({ ...fixtures.viewer, discoverable: fixtureDiscoverable }),
  getSuggestions: (limit?: number) =>
    settle([...fixtures.people, ...fixtures.societies].slice(0, limit ?? 5)),
  getConnection: (otherId: string) =>
    settle([...fixtures.people, ...fixtures.societies].find((p) => p.actor.id === otherId)?.reasons ?? []),
  getConceptActors: (conceptId: string) =>
    settle(
      [...fixtures.people, ...fixtures.societies]
        .filter((s) => s.actor.topConcepts.some((c) => c.conceptId === conceptId))
        .map((s) => s.actor),
    ),
  listAsks: () => settle({ items: fixtures.asks }),
  createAsk: () => settle({ id: "ask-new" }),
  searchAspirations: (q: string) => settle(fixtures.aspirations(q), 320),
  searchBlurbs: async () => null,
  searchSmart: async (q: string, ai = false, signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
    if (ai) return null;
    const result = await settle(searchFixtures(q), 160);
    if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
    return result;
  },
  postInterest: (rawText: string, stance) => {
    fixtureInterests.push({
      id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rawText: rawText.trim(),
      conceptLabel: null,
      stance,
      visibility: "institution",
      resolved: false,
      conceptId: null,
    });
    saveFixtureSettings();
    return settle({ ok: true as const });
  },
  setDiscoverable: (discoverable: boolean) => {
    fixtureDiscoverable = discoverable;
    saveFixtureSettings();
    return settle(fixtures.viewer);
  },
  listInterests: () => settle(fixtureInterests.map((interest) => ({ ...interest }))),
  setInterestVisibility: (interestId: string, visibility) => {
    const row = fixtureInterests.find((i) => i.id === interestId);
    if (row) row.visibility = visibility;
    saveFixtureSettings();
    return settle({ ok: true as const });
  },
  createActor: () => settle(fixtures.viewer),
  getCourseCatalog: () => settle(fixtures.courses),
  listImports: () => settle(fixtures.imports),
  createImport: async () => { throw new Error("Import processing needs the connected backend. This local preview does not upload or process your files."); },
  me: () => settle({ status: 200, body: { actor: fixtures.viewer, authMode: "demo" as const } }),
  login: () => settle({ status: 200, body: { actor: fixtures.viewer, authMode: "demo" as const } }),
  logout: () => settle(undefined),
};

export const api: typeof realApi = USING_FIXTURES ? fixtureApi : realApi;
