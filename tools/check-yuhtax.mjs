// Kiểm tra: mọi file mẫu .yuhtax trong tools/fixtures/ (kể cả bản cũ) vẫn mở được bằng code hiện tại.
// deploy.sh chạy script này trước khi deploy; lỗi → dừng deploy.
//   node tools/check-yuhtax.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// datafile.js không import gì → nạp thẳng dạng data: URL (khỏi cần package.json "type": "module")
const src = readFileSync(join(root, 'public/datafile.js'), 'utf8');
const DF = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const dir = join(root, 'tools/fixtures');
const files = readdirSync(dir).filter((f) => f.endsWith('.yuhtax')).sort();
let failed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

for (const name of files) {
  try {
    const text = readFileSync(join(dir, name), 'utf8');
    const f = DF.parse(text);
    ok(f.format === DF.FILE_FORMAT, `format sau nâng cấp = ${f.format}, cần ${DF.FILE_FORMAT}`);
    const month = DF.normalizeMonth(f.data.month);
    ok(Number.isFinite(month.amount) && ['g2n', 'n2g'].includes(month.mode), 'month không hợp lệ');
    const yearKeys = Object.keys(f.data).filter((k) => /^year:\d{4}$/.test(k));
    ok(yearKeys.length > 0, 'không có dữ liệu quyết toán năm nào');
    for (const k of yearKeys) {
      const y = DF.normalizeYear(f.data[k]);
      ok(y.months.length === 12, `${k}: không đủ 12 tháng`);
      ok(y.months.every((m) => [m.taxable, m.ins, m.withheld].every(Number.isFinite)), `${k}: số liệu tháng sai kiểu`);
      ok(Array.isArray(y.sources) && y.sources.every((s) => Number.isFinite(s.income)), `${k}: nguồn thu nhập sai`);
    }
    // Kỳ vọng riêng của từng file mẫu (nếu có) nằm trong trường "_expect"
    const exp = JSON.parse(text)._expect || {};
    for (const [path, want] of Object.entries(exp)) {
      const [key, ...rest] = path.split('.');
      const norm = key === 'month' ? DF.normalizeMonth(f.data.month) : DF.normalizeYear(f.data[key]);
      const got = rest.reduce((o, p) => o?.[p], norm);
      ok(JSON.stringify(got) === JSON.stringify(want), `${path}: được ${JSON.stringify(got)}, cần ${JSON.stringify(want)}`);
    }
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}: ${e.message}`);
  }
}

// File hỏng / không phải của app phải bị từ chối rõ ràng
for (const bad of ['', '{}', '{"app":"Khac","data":{}}', 'không phải json']) {
  try { DF.parse(bad); failed++; console.error(`✗ file sai "${bad}" lại được chấp nhận`); } catch {}
}

if (!files.length) { console.error('✗ Không có file mẫu nào trong tools/fixtures/'); process.exit(1); }
if (failed) { console.error(`\n${failed} lỗi — file .yuhtax cũ sẽ không mở được. Xem FORMAT.md.`); process.exit(1); }
console.log(`\nTất cả ${files.length} file mẫu .yuhtax đều mở được.`);
