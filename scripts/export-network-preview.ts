// Export only the repository's synthetic campus into the standalone preview.
// This is deliberately separate from the live /api/network request path.
import { readFile, writeFile } from "node:fs/promises";
import { pool } from "../src/db.js";
import { getNetworkDirectory } from "../src/services/network.js";

if (!process.argv.includes("--seed-only")) {
  throw new Error(
    "This exporter requires --seed-only and a database containing only the checked-in synthetic seed actors.",
  );
}

try {
  const sql = await readFile(
    new URL("../db/seed-data/snapshot.sql", import.meta.url),
    "utf8",
  );
  const actorBlock = sql.match(
    /COPY public\.actor \([^\n]+\) FROM stdin;\n([\s\S]*?)\n\\\./,
  )?.[1];
  if (!actorBlock)
    throw new Error("The checked-in seed actor table was not found.");
  const seededNames = new Map(
    actorBlock.split("\n").map((line) => {
      const fields = line.split("\t");
      return [fields[0], fields[3]];
    }),
  );
  const network = await getNetworkDirectory();
  if (
    network.actors.some(
      (actor) => seededNames.get(actor.id) !== actor.displayName,
    )
  ) {
    throw new Error(
      "The database contains actors that do not match the synthetic seed. Export stopped.",
    );
  }
  // The public demo needs profile links, not copies of contact methods.
  for (const actor of network.actors) actor.contact.methods = [];
  await writeFile(
    new URL("../web/src/home/network-snapshot.json", import.meta.url),
    JSON.stringify(network) + "\n",
  );
  console.log(
    `Exported ${network.actors.length} synthetic profiles, ${network.totals.areas} areas, and ${network.totals.concepts} interests.`,
  );
} finally {
  await pool.end();
}
