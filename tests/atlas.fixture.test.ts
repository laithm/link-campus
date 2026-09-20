import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("fixture atlas removes private interests from membership and explanations", async () => {
  // Bundle the browser client with the same explicit fixture flag as Vite.
  const bundle = await build({
    entryPoints: ["web/src/api/client.ts"], bundle: true, write: false,
    format: "esm", platform: "browser", define: { "import.meta.env.VITE_FIXTURES": '"1"' },
  });
  const { api } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const before = await api.getAtlas(undefined, 24);
  const shared = before.suggestions.find((suggestion: { sharedConceptIds: string[] }) => suggestion.sharedConceptIds.length > 1);
  assert(shared, "fixture covers overlapping interests");
  const hidden = shared.sharedConceptIds[0];
  const interest = (await api.listInterests()).find((row: { conceptId: string }) => row.conceptId === hidden);
  await api.setInterestVisibility(interest.id, "private");
  const after = await api.getAtlas(undefined, 24);
  assert(!after.interests.some((row: { conceptId: string }) => row.conceptId === hidden));
  const samePerson = after.suggestions.find((suggestion: { actor: { id: string } }) => suggestion.actor.id === shared.actor.id);
  assert(samePerson, "a remaining visible match keeps the person discoverable");
  for (const suggestion of after.suggestions) {
    assert(!suggestion.sharedConceptIds.includes(hidden));
    assert(!suggestion.reasons.some((reason: { evidence: { id: string }[] }) => reason.evidence.some((evidence) => evidence.id === hidden)));
  }
  assert.equal((await api.getAtlas(hidden)).total, 0);
});
