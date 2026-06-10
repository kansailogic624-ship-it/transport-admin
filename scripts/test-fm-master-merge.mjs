import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { parseFileMakerDispatchSheet } from "../src/lib/filemaker-dispatch-parser.ts";
import { mergeMastersFromFileMakerDispatches } from "../src/lib/masters.ts";
import { DEFAULT_MASTERS } from "../src/lib/types.ts";

const fmPath =
  "c:/Users/大西本社/OneDrive/デスクトップ/実績・労務・生産性管理/ファイルメーカー日時売上/20260501.xlsx";

const buf = fs.readFileSync(fmPath);
const wb = XLSX.read(buf, { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: "",
});
const dispatches = parseFileMakerDispatchSheet(rows, "fm.xlsx");
const masters = mergeMastersFromFileMakerDispatches(DEFAULT_MASTERS, dispatches);

const amazonJobs = masters.shipperJobs.Amazon ?? [];
console.log("Amazon jobs:", amazonJobs.slice(0, 10));
console.log("shippers:", masters.shippers.filter((s) => /amazon/i.test(s)));

const hasLp = amazonJobs.some((j) => j.includes("LP"));
if (!hasLp) {
  console.error("FAIL: expected Amazon LP job from FM");
  process.exit(1);
}
if (amazonJobs.includes("安井")) {
  console.error("FAIL: junk in master");
  process.exit(1);
}
console.log("OK");
