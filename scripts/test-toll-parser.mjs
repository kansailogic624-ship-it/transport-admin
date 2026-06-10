import { parseTollCsv } from "../src/lib/toll-csv-parser.ts";

const sample = `日,曜,ｶｰﾄﾞ番号,車番,車種,入口名,出口名,割引区分,通行料金,割引金額,差引金額
2026/4/2,火,0582-1324,京都 100い96-86,4,三木小野,京都南,深夜30%,2290,687,1603
2026/4/3,水,0582-1324,京都 100い96-86,4,城南宮南,巨椋池本線,朝夕50%*,410,205,205
,カード,京都 100い96-86,,,,,,,,
,カード 大口・多頻度対象額,,,,,,,120000,30000,90000
,カード 利用金額計,,,,,,,145610,39828,105782
2026/4/2,火,0582-5678,京都 100い96-57,4,入口,出口,,1000,100,900
,カード 利用金額計,,,,,,,5000,500,4500`;

const r = parseTollCsv(sample, "corpo", "corpo-test.csv");
console.log("vehicles:", r.vehicles.length);
for (const v of r.vehicles) {
  console.log(v.rawPlate, v.totalAmount);
}
const target = r.vehicles.find((v) => v.rawPlate.includes("96-86"));
console.log(
  "96-86 amount:",
  target?.totalAmount,
  target?.totalAmount === 105782 ? "OK" : "FAIL",
);
