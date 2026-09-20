# Local preview verification

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

This verifies the standalone frontend demonstration, not PostgreSQL, Ollama, live messaging, shared editing, or production authentication.
