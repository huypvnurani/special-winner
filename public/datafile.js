// Định dạng dữ liệu người dùng & file sao lưu .yuhtax — xem FORMAT.md.
// File thuần (không import, không đụng DOM/IndexedDB) để tools/check-yuhtax.mjs kiểm tra được bằng Node.
//
// NGUYÊN TẮC GIỮ TƯƠNG THÍCH LÂU DÀI (file lưu hôm nay phải mở được ở mọi bản app sau này):
//  1. Không đổi tên / đổi ý nghĩa / xoá trường cũ. Chỉ THÊM trường mới, và trường mới phải có giá trị mặc định.
//  2. Bắt buộc phải đổi cấu trúc → tăng FILE_FORMAT và thêm hàm vào MIGRATIONS (format n → n+1). Không bao giờ xoá migration cũ.
//  3. Dữ liệu nạp vào (từ file hay IndexedDB) luôn đi qua normalize*: thiếu thì lấy mặc định, sai kiểu thì sửa, trường lạ giữ nguyên.
//  4. Mỗi lần đổi format: thêm file mẫu mới vào tools/fixtures/, giữ nguyên file mẫu cũ.

export const FILE_APP = 'YuhTahnTax';
export const FILE_FORMAT = 1;

// MIGRATIONS[n](file) nhận file format n, trả về file format n + 1.
// Ví dụ khi có format 2:  1: (f) => ({ ...f, format: 2, data: { ...f.data, /* đổi cấu trúc ở đây */ } }),
const MIGRATIONS = {};

/** Toàn bộ dữ liệu (object key → value) → nội dung file .yuhtax */
export function serialize(data, build = '') {
  return JSON.stringify({ app: FILE_APP, format: FILE_FORMAT, build, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Nội dung file .yuhtax → { format, exportedAt, data } đã nâng lên FILE_FORMAT hiện tại. Lỗi → throw Error tiếng Việt. */
export function parse(text) {
  let f;
  try { f = JSON.parse(String(text).replace(/^﻿/, '')); } catch { throw new Error('File bị hỏng hoặc không đúng định dạng .yuhtax'); }
  if (!f || typeof f !== 'object' || String(f.app).toLowerCase() !== FILE_APP.toLowerCase()) throw new Error('Đây không phải file dữ liệu YuhTahnTax');
  if (!f.data || typeof f.data !== 'object' || Array.isArray(f.data)) throw new Error('File không có dữ liệu');
  f.format = Number.isInteger(f.format) && f.format > 0 ? f.format : 1;
  if (f.format > FILE_FORMAT) throw new Error('File được lưu từ phiên bản app mới hơn. Hãy mở lại app (có mạng) để cập nhật rồi thử lại.');
  while (f.format < FILE_FORMAT) {
    const step = MIGRATIONS[f.format];
    if (!step) throw new Error(`Thiếu bước chuyển đổi từ định dạng ${f.format}`);
    f = step(f);
  }
  return f;
}

// ---------- Làm sạch từng loại dữ liệu ----------
const amount = (v, d = 0) => {                       // số tiền ≥ 0 (nhận cả "30.000.000")
  const n = typeof v === 'string' ? +v.replace(/[^\d]/g, '') : +v;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : d;
};
const count = (v, d = 0, max = 999) => { const n = Math.floor(+v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Tab Lương tháng (key 'month') */
export function normalizeMonth(v) {
  const o = obj(v);
  return {
    ...o,
    mode: oneOf(o.mode, ['g2n', 'n2g'], 'g2n'),
    amount: amount(o.amount, 30_000_000),
    ym: typeof o.ym === 'string' && /^\d{4}-\d{2}$/.test(o.ym) ? o.ym : null,
    region: count(o.region, 1, 4) || 1,
    dep: count(o.dep, 0, 20),
    insMode: oneOf(o.insMode, ['full', 'custom'], 'full'),
    insSalary: amount(o.insSalary),
    exempt: amount(o.exempt),
    contract: oneOf(o.contract, ['ld', 'short'], 'ld'),   // HĐLĐ ≥ 3 tháng · thử việc riêng / CTV / HĐ < 3 tháng
    meal: amount(o.meal),                                 // phụ cấp ăn trưa (đã nằm trong gross)
    union: o.union === true,                              // đoàn viên công đoàn
    syncYear: o.syncYear !== false,                   // tự ghi vào quyết toán năm (mặc định bật)
  };
}

/** Một tháng trong quyết toán năm */
export function normalizeMonthRow(v) {
  const o = obj(v);
  return { ...o, taxable: amount(o.taxable), ins: amount(o.ins), withheld: amount(o.withheld), dep: count(o.dep, 0, 20) };
}

/** Một nguồn thu nhập khác trong quyết toán năm */
export function normalizeSource(v) {
  const o = obj(v);
  return {
    ...o,
    name: typeof o.name === 'string' ? o.name.slice(0, 200) : '',
    kind: oneOf(o.kind, ['ld', 'vl'], 'ld'),          // ld: hợp đồng lao động · vl: vãng lai / dưới 3 tháng
    income: amount(o.income), ins: amount(o.ins), withheld: amount(o.withheld),
  };
}

/** Quyết toán năm (key 'year:YYYY') */
export function normalizeYear(v) {
  const o = obj(v);
  const months = Array.isArray(o.months) ? o.months : [];
  // Bản đầu chỉ có 1 cặp otherInc/otherTax → chuyển thành 1 nguồn thu nhập khác
  let sources = Array.isArray(o.sources) ? o.sources
    : (amount(o.otherInc) || amount(o.otherTax)) ? [{ name: 'Thu nhập khác', kind: 'vl', income: o.otherInc, withheld: o.otherTax }] : [];
  sources = sources.slice(0, 50).map(normalizeSource);
  return {
    ...o,
    region: count(o.region, 1, 4) || 1,
    months: Array.from({ length: 12 }, (_, i) => normalizeMonthRow(months[i])),
    depMonths: count(o.depMonths, 0, 12 * 20),
    depAuto: o.depAuto !== false,                     // true: số tháng NPT = tổng NPT từng tháng
    sources,
    charity: amount(o.charity), pension: amount(o.pension),
  };
}
