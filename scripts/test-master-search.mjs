import {
  filterShipperJobGroups,
  matchesTextSearch,
  matchesVehicleSearch,
} from "../src/lib/master-search.ts";

for (const v of ["(京都100い84-73)", "京都100い84-73", "84-73"]) {
  if (!matchesVehicleSearch("84-73", v)) {
    console.error("FAIL vehicle", v);
    process.exit(1);
  }
}
if (matchesVehicleSearch("84-73", "60-30")) {
  console.error("FAIL false positive");
  process.exit(1);
}

if (!matchesTextSearch("amazon", "Amazon")) {
  console.error("FAIL case");
  process.exit(1);
}
if (!matchesTextSearch("ＡＢＣ", "abc物流")) {
  console.error("FAIL fullwidth");
  process.exit(1);
}

const groups = filterShipperJobGroups(
  ["Amazon", "JOTO"],
  { Amazon: ["常温配送", "午前便"], JOTO: ["夜間便"] },
  "午前",
);
if (groups.length !== 1 || groups[0].jobs.length !== 1) {
  console.error("FAIL job filter", groups);
  process.exit(1);
}

console.log("OK");
