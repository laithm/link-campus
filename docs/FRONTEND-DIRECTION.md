# Link — campus atlas

## Visual direction
Audience: students seeking collaborators across departments. Primary job: discover a relevant person, understand why, and initiate a connection.

Palette: paper #EEF1F5, ink #1D2940, cobalt #3156D3, signal orange #DC673E, white #FBFCFE, muted slate #75839A. Space Grotesk headings and Manrope body/controls, bundled locally. Orange is used sparingly for navigation and interest terminals. Crisp corners and clear borders replace the earlier soft green presentation.

Layout: an ink-blue navigation spine with a custom interlocking LINK mark → focused discovery with an interest sphere and a small 3D network → a separate full Database atlas. The database view's signature is a department-to-interest diagram weighted by actual profile memberships, followed by a complete directory and individual profile links. Dimensional structure stays concentrated in the discovery map. The rest uses direct labels, factual counts, and useful navigation.

The direction draws from campus research maps and field books. Department areas and interest links encode actual data. No decorative statistics, random data nodes, sparkles, or invented relationships.

## Hackathon narrative
Select a shared interest → select a person in the atlas → read concept/context evidence → draft a connection request. Show the accessible list and reduced-motion controls. The 3D coordinates are illustrative; matching evidence comes from the existing API, not spatial distance.

HackMIT is an assumption until the exact MIT event is confirmed. The official 2026 FAQ identifies optional impact tracks and Most Creative / Most Technically Impressive challenges, but no verified numerical judging rubric was available: https://hackmit.org/?lang=en . Current prize resources: https://dayof.hackmit.org/resources . Education may be relevant if the user's event actually offers it; general submissions are also possible.

Do not reuse metrics, awards, pilot claims or team histories in the repository's generated collaboration-story fixtures as factual evidence.

## First preview boundaries
Use the project's fixture data for a reproducible shareable frontend preview. Clearly distinguish local demo state from live messaging, model inference, document ingestion and collaborative editing. Preserve production endpoint contracts. The user has approved GitHub publishing and the remake is available at https://link-campus.vercel.app/.

The current atlas uses a rotatable interest sphere as its key. It drives an authenticated backend query across complete visible interest memberships. The network contains at most 12 actual returned people, without decorative nodes; shared-interest edges are limited to a sparse forest, and labels fade by depth. The selected interest controls the ranked network and top profile cards together.
