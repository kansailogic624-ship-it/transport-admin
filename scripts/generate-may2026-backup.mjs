import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const require = createRequire(import.meta.url);

async function main() {
  const { register } = await import("tsx/esm/api");
  register();

  const { generateMay2026Sample, getMay2026SampleStats } = await import(
    "../src/lib/seed-may2026.ts"
  );

  const backup = generateMay2026Sample();
  const stats = getMay2026SampleStats(backup.records);

  const outJson = join(root, "public", "sample-may2026-backup.json");
  writeFileSync(outJson, JSON.stringify(backup, null, 2), "utf8");

  console.log("Generated:", outJson);
  console.log(
    `Records: ${stats.recordCount}, Trips: ${stats.tripCount}, Month: ${stats.yearMonth}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
