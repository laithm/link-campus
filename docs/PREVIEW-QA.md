# Local preview verification

## Complete directory and visual identity

The Database atlas (`/network`) was verified in standalone preview mode and
against the real local API/PostgreSQL stack:

- All 316 discoverable profiles appeared exactly once across 14 directory pages.
  Backend totals were 291 people, 25 communities, 9 area buckets, 706 interests,
  and 2,251 distinct actor-interest memberships.
- Selecting Computer Science and fibre technology produced exactly the 16
  profiles found by filtering the complete API response. The diagram's counts
  update with the selection. People/community filters and empty-search/reset
  states work.
- Shared profile URLs survive an unauthenticated visit and login. A direct
  Aditya Lindqvist link opened the correct profile with all nine API interests.
- Profile drawers expose related profiles, preserve filters, close with Escape,
  restore document scrolling, and provide a selectable link when clipboard
  access is unavailable.
- Desktop 1440px and mobile 390px layouts were visually inspected. The 320px
  directory switches to one column without horizontal overflow. Mobile chart
  labels and metadata were enlarged after inspection.
- Home, Search, and Settings use the updated ink-blue/cobalt identity without
  horizontal overflow. Both desktop and mobile sphere controls still filter
  the person map. Sidebar overflow on shorter screens was corrected.
- Backend directory/atlas/privacy regression tests and the connected frontend
  production build pass. Browser checks reported no uncaught errors.

The public directory preview is an explicit export of synthetic seed profiles;
it is separate from the authenticated live API. Public snapshot contact methods
are omitted. See [directory data semantics](NETWORK.md).

## Interest sphere and connected atlas update

Verified against the real local API on port 3001 and the isolated PostgreSQL +
pgvector database on port 55432, through the connected frontend on port 5174:

- Cookie-session login with the seeded Nina account returns nine interests and
  173 matching people, capped at twelve rendered nodes.
- Rendered node IDs exactly match the API response. No decorative people nodes.
- Selecting fibre technology returns 111 matches; every shown person includes
  that canonical interest in `sharedConceptIds`.
- Dragging directly from a sphere label changes the selected interest. Dragging
  to contrastive learning returns four people, all sharing that interest; the
  three profile cards match the first three ranked API results.
- Desktop and 390px mobile layouts, including expanded mode, have no horizontal
  overflow. Mobile labels are capped at four, desktop at six. Dragging the network
  changes which names are in front; rear names fade and leave keyboard focus.
- Sphere labels, arrows, reset, and keyboard controls use the same filter.
- A simulated WebGL context-loss event switches to an SVG view containing the
  same twelve actual profiles and preserves selection.
- Labs use the separate existing recommendations flow; the exact person-interest
  sphere only appears on the People tab.

Backend integration and fixture privacy tests pass, as do backend typechecking
and the connected frontend production build. The tests cover filtering before
limits, full memberships beyond profile-chip limits, private and hidden records,
authentication, validation, and interest-update ownership. See
[backend setup and test commands](BACKEND-ATLAS.md).

Seed profiles are generated demonstration data in a real database. Ollama-backed
generation/import workers are outside these checks. The public Vercel preview
continues to use standalone fixture mode.

## Earlier standalone preview checks

The frontend is served at `http://127.0.0.1:5173` using `npm run dev:demo`.

Verified in Chromium through agent-browser:

- Desktop layout at 1440 pixels; mobile layout at 390 pixels.
- Three.js canvas renders; selection changes the match card.
- Atlas pause, expansion and Escape-to-close work.
- Multiple-interest filtering keeps matching people visible.
- A forced WebGL context loss switches to SVG; profile selection still works.
- Topic search (robotics) returns sample people and groups with matching evidence.
- Bookmarks persist when navigating and reloading.
- Profile modal supports keyboard focus, Escape and an explicit close button.
- Writing a demo introduction persists it locally; its Collaborations thread displays the exact text and clearly says no message was sent.
- The mobile navigation closes after selecting Settings.
- Mobile settings layout was corrected to avoid horizontal overflow.
- Demo APIs were smoke-checked with network calls trapped: search, aborts, settings, local request creation/reload, duplicate handling and unsupported action explanations produced zero backend calls.

TypeScript and the optimized demo build pass. Browser checks reported no uncaught page errors. The Three.js module and existing collaboration editor load separately from the main app.

These earlier checks verify the standalone frontend demonstration. The connected
atlas checks above additionally exercise PostgreSQL and API authentication, but
do not certify model generation, live messaging, or shared editing.
