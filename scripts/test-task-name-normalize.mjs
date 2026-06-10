import {
  getCleanTaskName,
  normalizeJobNameForAggregation,
} from "../src/lib/task-name-normalize.ts";

const cases = [
  ["AmazonLP①", "AmazonLP"],
  ["AmazonLP②", "AmazonLP"],
  ["宅配京都②", "宅配京都"],
  ["Joshin1", "Joshin"],
  ["Joshin２", "Joshin"],
  ["Joshin②", "Joshin"],
  ["常温配送", "常温配送"],
  ["", ""],
];

for (const [input, expected] of cases) {
  const got = getCleanTaskName(input);
  if (got !== expected) {
    console.error(`FAIL "${input}" => "${got}" expected "${expected}"`);
    process.exit(1);
  }
}

if (normalizeJobNameForAggregation("AmazonLP①") !== "AmazonLP") {
  console.error("FAIL normalize");
  process.exit(1);
}

console.log("OK");
