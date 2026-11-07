// Logic tính lương & thuế TNCN (thuần, không đụng DOM).
// Số liệu cần đối chiếu lại khi có văn bản mới — tất cả gom ở RULES / INSURANCE bên dưới.

const M = 1_000_000;

// Biểu thuế luỹ tiến từng phần theo THÁNG: [ngưỡng trên, thuế suất]. Năm = ngưỡng × 12.
export const RULES = {
  2026: {
    label: '2026 (biểu 5 bậc)',
    personal: 15.5 * M,
    dependent: 6.2 * M,
    brackets: [[10 * M, 0.05], [30 * M, 0.10], [60 * M, 0.20], [100 * M, 0.30], [Infinity, 0.35]],
    note: 'Luật Thuế TNCN 109/2025/QH15 (biểu 5 bậc áp dụng từ kỳ tính thuế 2026), NQ 110/2025/UBTVQH15 (giảm trừ gia cảnh).',
  },
};

// Mức tham chiếu (lương cơ sở) theo kỳ → trần BHXH/BHYT = 20 × mức này.
// Lương tối thiểu vùng → trần BHTN = 20 × mức vùng.
export const INSURANCE = {
  rates: { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 },                 // người lao động
  employer: { bhxh: 0.175, bhyt: 0.03, bhtn: 0.01 },              // công ty (gồm 0,5% TNLĐ-BNN)
  base: [                                                          // [áp dụng từ YYYY-MM, mức]
    ['2026-01', 2_340_000],
    ['2026-07', 2_530_000],
  ],
  regionMin: [                                                     // [từ, [vùng I, II, III, IV]]
    ['2026-01', [5_310_000, 4_730_000, 4_140_000, 3_700_000]],
  ],
};

const pick = (list, ym) => list.filter(([from]) => from <= ym).at(-1)?.[1] ?? list[0][1];
export const baseSalary = (ym) => pick(INSURANCE.base, ym);
export const regionMin = (ym, region) => pick(INSURANCE.regionMin, ym)[region - 1];
export const YEARS = Object.keys(RULES).map(Number);
export const rulesFor = (year) => RULES[year] ?? RULES[Math.max(...YEARS)];

/** Bảo hiểm bắt buộc người lao động đóng trong tháng `ym` ('YYYY-MM'). */
export function insurance(insSalary, ym, region = 1) {
  const capSH = 20 * baseSalary(ym);
  const capTN = 20 * regionMin(ym, region);
  const sh = Math.min(insSalary, capSH);
  const tn = Math.min(insSalary, capTN);
  const r = INSURANCE.rates, e = INSURANCE.employer;
  const emp = { bhxh: sh * r.bhxh, bhyt: sh * r.bhyt, bhtn: tn * r.bhtn };
  const com = { bhxh: sh * e.bhxh, bhyt: sh * e.bhyt, bhtn: tn * e.bhtn };
  return {
    ...emp, total: emp.bhxh + emp.bhyt + emp.bhtn,
    employer: { ...com, total: com.bhxh + com.bhyt + com.bhtn },
    capSH, capTN, cappedSH: insSalary > capSH, cappedTN: insSalary > capTN,
  };
}

/** Thuế luỹ tiến cho thu nhập tính thuế `ti`. `months` = 1 (tháng) hoặc 12 (năm). Trả về chi tiết từng bậc. */
export function progressiveTax(ti, rules, months = 1) {
  let prev = 0, total = 0;
  const rows = [];
  for (const [top, rate] of rules.brackets) {
    const hi = top * months;
    const part = Math.max(0, Math.min(ti, hi) - prev);
    rows.push({ from: prev, to: hi, rate, part, tax: part * rate });
    total += part * rate;
    prev = hi;
    if (ti <= hi) break;
  }
  return { total, rows };
}

/**
 * Lương tháng Gross → Net.
 * opt: { gross, insSalary (null = theo gross), exempt (thu nhập miễn thuế trong gross), dependents, region, ym }
 */
export function grossToNet(opt) {
  const { gross, exempt = 0, dependents = 0, region = 1, ym } = opt;
  const insSalary = opt.insSalary ?? gross;
  const rules = rulesFor(+ym.slice(0, 4));
  const ins = insurance(insSalary, ym, region);
  const taxable = Math.max(0, gross - exempt);                         // thu nhập chịu thuế
  const deduct = rules.personal + dependents * rules.dependent;
  const ti = Math.max(0, taxable - ins.total - deduct);                 // thu nhập tính thuế
  const tax = progressiveTax(ti, rules);
  const net = gross - ins.total - tax.total;
  return {
    gross, insSalary, ins, exempt, taxable, deduct, personal: rules.personal,
    dependentDeduct: dependents * rules.dependent, ti, tax, net,
    employerCost: gross + ins.employer.total, rules,
  };
}

/** Net → Gross: tìm nhị phân (net tăng đơn điệu theo gross). insSalary null = bằng gross. */
export function netToGross(opt) {
  let lo = opt.net, hi = opt.net * 3 + 10 * M;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (grossToNet({ ...opt, gross: mid }).net < opt.net) lo = mid; else hi = mid;
  }
  return grossToNet({ ...opt, gross: Math.round(hi) });
}

/**
 * Quyết toán thuế năm.
 * months: [{ taxable, ins, withheld }] × 12 (taxable = thu nhập chịu thuế từ tiền lương, đã trừ khoản miễn thuế)
 * dependentMonths: tổng số tháng giảm trừ của tất cả người phụ thuộc
 * other: { income, withheld } — thu nhập tiền lương khác (vãng lai, đã khấu trừ 10%…)
 * charity: đóng góp từ thiện, nhân đạo, khuyến học được trừ
 * pension: quỹ hưu trí tự nguyện được trừ (tối đa 1 triệu/tháng)
 */
export function annualSettlement({ year, months, dependentMonths = 0, other = { income: 0, withheld: 0 }, charity = 0, pension = 0 }) {
  const rules = rulesFor(year);
  const sum = (k) => months.reduce((s, m) => s + (+m[k] || 0), 0);
  const taxable = sum('taxable') + (+other.income || 0);
  const ins = sum('ins');
  const personal = rules.personal * 12;
  const dependent = rules.dependent * dependentMonths;
  const pensionDed = Math.min(pension, 12 * M);
  const deduct = personal + dependent + ins + charity + pensionDed;
  const ti = Math.max(0, taxable - deduct);
  const tax = progressiveTax(ti, rules, 12);
  const withheld = sum('withheld') + (+other.withheld || 0);
  const diff = tax.total - withheld;                                   // > 0: nộp thêm, < 0: được hoàn
  return { rules, taxable, ins, personal, dependent, charity, pension: pensionDed, deduct, ti, tax, withheld, diff };
}
