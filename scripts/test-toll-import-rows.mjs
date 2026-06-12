import {
  assignBreakdownVehicle,
  buildTollImportRows,
  flattenTollImportRowsForSave,
  TOLL_UNREGISTERED_LABEL,
} from "../src/lib/toll-import-rows.ts";

const rows = buildTollImportRows(
  [
    {
      rawPlate: "9023",
      totalAmount: 10000,
      vehicleNumber: "京都400あ600",
      ocrHint: "",
    },
    {
      rawPlate: "3701",
      totalAmount: 12400,
      vehicleNumber: "",
      ocrHint: "3701",
    },
    {
      rawPlate: "9999",
      totalAmount: 5000,
      vehicleNumber: "",
      ocrHint: "9999",
    },
  ],
  "KJS高速明細",
);

if (rows.length !== 2) {
  console.error("FAIL: expected 2 display rows, got", rows.length);
  process.exit(1);
}

const group = rows.find((r) => r.kind === "unregistered_group");
if (!group || group.totalAmount !== 17400) {
  console.error("FAIL: unregistered group total", group);
  process.exit(1);
}

const item3701 = group.breakdown?.find((b) => b.csvPlate === "3701");
if (!item3701) {
  console.error("FAIL: missing breakdown 3701");
  process.exit(1);
}

const after = assignBreakdownVehicle(
  rows,
  group.id,
  item3701.id,
  "京都400あ1577",
);

const afterGroup = after.find((r) => r.kind === "unregistered_group");
const movedRow = after.find(
  (r) => r.kind === "matched" && r.vehicleNumber === "京都400あ1577",
);

if (!afterGroup || afterGroup.totalAmount !== 5000) {
  console.error("FAIL: group should be 5000 after move", afterGroup);
  process.exit(1);
}
if (!movedRow || movedRow.totalAmount !== 12400) {
  console.error("FAIL: moved row", movedRow);
  process.exit(1);
}

const flat = flattenTollImportRowsForSave(after);
if (flat.length !== 3) {
  console.error("FAIL: flat save rows", flat);
  process.exit(1);
}

const unreg = flat.find((r) => r.ocrHint?.includes(TOLL_UNREGISTERED_LABEL));
if (!unreg || unreg.totalAmount !== 5000) {
  console.error("FAIL: remaining unregistered save", unreg);
  process.exit(1);
}

console.log("OK");
