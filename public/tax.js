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
  employer: { bhxh: 0.175, bhyt: 0.03, bhtn: 0.01, kpcd: 0.02 }, // công ty: BHXH 14% hưu trí + 3% ốm đau + 0,5% TNLĐ; KPCĐ 2%
  unionRate: 0.005,                                                // đoàn phí NLĐ (nếu là đoàn viên)
  base: [                                                          // [áp dụng từ YYYY-MM, mức]
    ['2026-01', 2_340_000],
    ['2026-07', 2_530_000],
  ],
  regionMin: [                                                     // [từ, [vùng I, II, III, IV]]
    ['2026-01', [5_310_000, 4_730_000, 4_140_000, 3_700_000]],
  ],
};

// Phụ cấp ăn giữa ca không tính thuế / tháng; khấu trừ cố định cho HĐ dưới 3 tháng, CTV (mỗi lần chi trả ≥ 2 triệu)
export const MEAL_EXEMPT = 730_000;
export const FLAT = { rate: 0.10, min: 2_000_000 };

const pick = (list, ym) => list.filter(([from]) => from <= ym).at(-1)?.[1] ?? list[0][1];
export const baseSalary = (ym) => pick(INSURANCE.base, ym);
export const regionMin = (ym, region) => pick(INSURANCE.regionMin, ym)[region - 1];
export const YEARS = Object.keys(RULES).map(Number);
export const rulesFor = (year) => RULES[year] ?? RULES[Math.max(...YEARS)];

/**
 * Bảo hiểm bắt buộc trong tháng `ym` ('YYYY-MM').
 * Mức đóng không thấp hơn lương tối thiểu vùng, không quá trần (BHXH/BHYT: 20 × mức tham chiếu; BHTN: 20 × lương tối thiểu vùng).
 * insSalary ≤ 0 → không đóng (HĐ dưới 3 tháng, CTV…).
 */
export function insurance(insSalary, ym, region = 1) {
  const capSH = 20 * baseSalary(ym);
  const floor = regionMin(ym, region);
  const capTN = 20 * floor;
  const base = insSalary > 0 ? Math.max(insSalary, floor) : 0;
  const sh = Math.min(base, capSH);
  const tn = Math.min(base, capTN);
  const r = INSURANCE.rates, e = INSURANCE.employer;
  const emp = { bhxh: sh * r.bhxh, bhyt: sh * r.bhyt, bhtn: tn * r.bhtn };
  const com = { bhxh: sh * e.bhxh, bhyt: sh * e.bhyt, bhtn: tn * e.bhtn, kpcd: sh * e.kpcd };
  return {
    ...emp, total: emp.bhxh + emp.bhyt + emp.bhtn,
    employer: { ...com, total: com.bhxh + com.bhyt + com.bhtn },   // KPCĐ tính riêng, không phải bảo hiểm
    base: sh, capSH, capTN, floor,
    raisedToFloor: insSalary > 0 && insSalary < floor, cappedSH: base > capSH, cappedTN: base > capTN,
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
 * opt: {
 *   gross       tổng thu nhập tháng (đã gồm phụ cấp ăn trưa)
 *   contract    'ld' = HĐLĐ từ 3 tháng (biểu luỹ tiến) · 'short' = thử việc riêng / CTV / HĐ dưới 3 tháng (khấu trừ 10%)
 *   insSalary   lương đóng BH (null = bằng gross)
 *   meal        phụ cấp ăn trưa (miễn thuế tối đa MEAL_EXEMPT)
 *   exempt      thu nhập miễn thuế khác (chênh lệch làm thêm giờ…)
 *   union       là đoàn viên công đoàn (đóng 0,5%, không được trừ khi tính thuế)
 *   dependents, region, ym
 * }
 */
export function grossToNet(opt) {
  const { gross, contract = 'ld', meal = 0, exempt = 0, union = false, dependents = 0, region = 1, ym } = opt;
  const short = contract === 'short';
  const insSalary = short ? 0 : (opt.insSalary ?? gross);
  const rules = rulesFor(+ym.slice(0, 4));
  const ins = insurance(insSalary, ym, region);
  const mealExempt = Math.min(meal, MEAL_EXEMPT, gross);
  const taxable = Math.max(0, gross - mealExempt - exempt);            // thu nhập chịu thuế
  let deduct = 0, personal = 0, dependentDeduct = 0, ti, tax;
  if (short) {
    ti = taxable;
    const t = taxable >= FLAT.min ? taxable * FLAT.rate : 0;
    tax = { total: t, flat: true, rows: [{ from: 0, to: Infinity, rate: FLAT.rate, part: t ? taxable : 0, tax: t }] };
  } else {
    personal = rules.personal; dependentDeduct = dependents * rules.dependent;
    deduct = personal + dependentDeduct;
    ti = Math.max(0, taxable - ins.total - deduct);                    // thu nhập tính thuế
    tax = progressiveTax(ti, rules);
  }
  // Đoàn phí: 0,5% lương đóng BH (chưa đóng BH thì theo gross), tối đa 10% mức tham chiếu
  const unionFee = union ? Math.min((ins.base || gross) * INSURANCE.unionRate, baseSalary(ym) * 0.1) : 0;
  const net = gross - ins.total - tax.total - unionFee;
  return {
    gross, contract, insSalary, ins, meal, mealExempt, exempt, taxable, deduct, personal, dependentDeduct,
    ti, tax, unionFee, net, employerCost: gross + ins.employer.total + ins.employer.kpcd, rules,
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
 * others: [{ income, ins, withheld }] — các nguồn thu nhập tiền lương khác (công ty thứ 2, vãng lai…)
 * charity: đóng góp từ thiện, nhân đạo, khuyến học được trừ
 * pension: quỹ hưu trí tự nguyện được trừ (tối đa 1 triệu/tháng)
 */
export function annualSettlement({ year, months, dependentMonths = 0, others = [], charity = 0, pension = 0 }) {
  const rules = rulesFor(year);
  const sum = (list, k) => list.reduce((s, m) => s + (+m[k] || 0), 0);
  const main = { taxable: sum(months, 'taxable'), ins: sum(months, 'ins'), withheld: sum(months, 'withheld') };
  const other = { taxable: sum(others, 'income'), ins: sum(others, 'ins'), withheld: sum(others, 'withheld') };
  const taxable = main.taxable + other.taxable;
  const ins = main.ins + other.ins;
  const personal = rules.personal * 12;
  const dependent = rules.dependent * dependentMonths;
  const pensionDed = Math.min(pension, 12 * M);
  const deduct = personal + dependent + ins + charity + pensionDed;
  const ti = Math.max(0, taxable - deduct);
  const tax = progressiveTax(ti, rules, 12);
  const withheld = main.withheld + other.withheld;
  const diff = tax.total - withheld;                                   // > 0: nộp thêm, < 0: được hoàn
  return { rules, main, other, taxable, ins, personal, dependent, charity, pension: pensionDed, deduct, ti, tax, withheld, diff };
}
