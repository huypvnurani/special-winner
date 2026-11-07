import { registerPWA } from './pwa.js';
import { RULES, YEARS, INSURANCE, baseSalary, regionMin, rulesFor, grossToNet, netToGross, annualSettlement, insurance } from './tax.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
const pct = (r) => `${+(r * 100).toFixed(2)}%`.replace('.', ',');
const money = (el) => +String(el.value).replace(/\D/g, '') || 0;
const int = (el) => Math.max(0, parseInt(String(el.value).replace(/\D/g, ''), 10) || 0);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Lưu trữ cục bộ (chỉ trên máy người dùng) ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('ytt:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ytt:' + k, JSON.stringify(v)); } catch {} },
};

// ---------- Ô nhập tiền: tự thêm dấu chấm ngăn cách ----------
function formatMoneyInput(el) {
  const n = money(el);
  el.value = n ? fmt(n) : '';
}
document.addEventListener('input', (e) => { if (e.target.matches('[data-money]')) formatMoneyInput(e.target); });

// ---------- Báo cáo: dữ liệu chung cho màn hình (và sau này xuất PDF / Excel) ----------
// report = { title, subtitle, highlight: {label, value, tone}, sections: [{ heading, rows: [[label, value, opts]] , note }] }
// opts: { bold, muted, indent, tone: 'good'|'bad' }
function renderReport(r) {
  const tone = { good: 'text-emerald-600', bad: 'text-rose-600' };
  const hl = r.highlight ? `
    <div class="card p-5 text-center">
      <p class="text-sm text-slate-500">${esc(r.highlight.label)}</p>
      <p class="text-3xl font-bold num mt-1 ${tone[r.highlight.tone] || 'text-brand'}">${esc(r.highlight.value)}</p>
      ${r.highlight.sub ? `<p class="text-xs text-slate-500 mt-1">${esc(r.highlight.sub)}</p>` : ''}
    </div>` : '';
  const secs = r.sections.map((s) => `
    <div class="card p-4">
      <h3 class="font-semibold mb-1">${esc(s.heading)}</h3>
      <table class="rep w-full text-sm num">${s.rows.map(([l, v, o = {}]) => `
        <tr class="${o.bold ? 'font-semibold' : ''} ${o.muted ? 'text-slate-500' : ''}">
          <td class="${o.indent ? 'pl-4' : ''}">${esc(l)}</td>
          <td class="text-right whitespace-nowrap pl-3 ${tone[o.tone] || ''}">${esc(v)}</td>
        </tr>`).join('')}
      </table>
      ${s.note ? `<p class="text-xs text-slate-500 mt-2">${esc(s.note)}</p>` : ''}
    </div>`).join('');
  return hl + secs;
}

const bracketRows = (tax) => tax.rows.map((b) => [
  `${pct(b.rate)}: ${b.to === Infinity ? `trên ${fmt(b.from)}` : `${fmt(b.from)} – ${fmt(b.to)}`}`,
  fmt(b.tax), { indent: true, muted: !b.part },
]);

// ================= Tab Lương tháng =================
const m = store.get('month', { mode: 'g2n', amount: 30_000_000, ym: null, region: 1, dep: 0, insMode: 'full', insSalary: 0, exempt: 0 });
const nowYm = new Date().toISOString().slice(0, 7);
if (m.ym && m.ym < '2026-01') m.ym = null;   // bản cũ từng cho chọn 2025

function setSeg(id, v) {
  $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
}

function loadMonth() {
  setSeg('mMode', m.mode); setSeg('mInsMode', m.insMode);
  $('mAmount').value = m.amount ? fmt(m.amount) : '';
  $('mYm').value = m.ym || nowYm;
  $('mRegion').value = m.region;
  $('mDep').value = m.dep;
  $('mInsSalary').value = m.insSalary ? fmt(m.insSalary) : '';
  $('mExempt').value = m.exempt ? fmt(m.exempt) : '';
}

function readMonth() {
  Object.assign(m, {
    amount: money($('mAmount')), ym: $('mYm').value || nowYm, region: +$('mRegion').value,
    dep: int($('mDep')), insSalary: money($('mInsSalary')), exempt: money($('mExempt')),
  });
  store.set('month', m);
}

export function monthReport() {
  const opt = {
    ym: m.ym || nowYm, region: m.region, dependents: m.dep, exempt: m.exempt,
    insSalary: m.insMode === 'custom' ? m.insSalary : null,
  };
  const r = m.mode === 'g2n' ? grossToNet({ ...opt, gross: m.amount }) : netToGross({ ...opt, net: m.amount });
  const [y, mo] = opt.ym.split('-');
  const capNote = [r.ins.cappedSH && `BHXH/BHYT tính trên mức trần ${fmt(r.ins.capSH)}`, r.ins.cappedTN && `BHTN tính trên mức trần ${fmt(r.ins.capTN)}`].filter(Boolean).join('; ');
  return {
    title: `Bảng tính lương tháng ${mo}/${y}`,
    subtitle: `${r.rules.label} · Vùng ${['I', 'II', 'III', 'IV'][m.region - 1]} · ${m.dep} người phụ thuộc`,
    highlight: m.mode === 'g2n'
      ? { label: 'Lương thực nhận (Net)', value: `${fmt(r.net)} ₫`, sub: `Thuế TNCN ${fmt(r.tax.total)} ₫ · Bảo hiểm ${fmt(r.ins.total)} ₫` }
      : { label: 'Lương Gross cần thoả thuận', value: `${fmt(r.gross)} ₫`, sub: `để nhận về ${fmt(r.net)} ₫` },
    sections: [
      { heading: 'Chi tiết', rows: [
        ['Lương Gross', fmt(r.gross), { bold: true }],
        ['Bảo hiểm bắt buộc (10,5%)', `− ${fmt(r.ins.total)}`],
        [`BHXH ${pct(INSURANCE.rates.bhxh)}`, fmt(r.ins.bhxh), { indent: true, muted: true }],
        [`BHYT ${pct(INSURANCE.rates.bhyt)}`, fmt(r.ins.bhyt), { indent: true, muted: true }],
        [`BHTN ${pct(INSURANCE.rates.bhtn)}`, fmt(r.ins.bhtn), { indent: true, muted: true }],
        ['Thu nhập miễn thuế', fmt(r.exempt), { muted: !r.exempt }],
        ['Thu nhập chịu thuế', fmt(r.taxable)],
        ['Giảm trừ bản thân', `− ${fmt(r.personal)}`],
        [`Giảm trừ người phụ thuộc (${m.dep})`, `− ${fmt(r.dependentDeduct)}`, { muted: !m.dep }],
        ['Thu nhập tính thuế', fmt(r.ti), { bold: true }],
        ['Thuế TNCN', `− ${fmt(r.tax.total)}`, { bold: true, tone: r.tax.total ? 'bad' : '' }],
        ['Lương Net', fmt(r.net), { bold: true, tone: 'good' }],
      ], note: capNote ? `Lương đóng BH ${fmt(r.insSalary)} vượt trần: ${capNote}.` : '' },
      { heading: 'Thuế theo từng bậc', rows: r.ti ? bracketRows(r.tax) : [['Thu nhập chưa tới mức phải nộp thuế', '0', { muted: true }]] },
      { heading: 'Chi phí công ty trả', rows: [
        ['Lương Gross', fmt(r.gross)],
        [`BHXH ${pct(INSURANCE.employer.bhxh)} (gồm TNLĐ-BNN)`, fmt(r.ins.employer.bhxh), { indent: true, muted: true }],
        [`BHYT ${pct(INSURANCE.employer.bhyt)}`, fmt(r.ins.employer.bhyt), { indent: true, muted: true }],
        [`BHTN ${pct(INSURANCE.employer.bhtn)}`, fmt(r.ins.employer.bhtn), { indent: true, muted: true }],
        ['Tổng chi phí', fmt(r.employerCost), { bold: true }],
      ] },
    ],
  };
}

function renderMonth() {
  $('mAmountLbl').textContent = m.mode === 'g2n' ? 'Lương Gross / tháng (VNĐ)' : 'Lương Net mong muốn / tháng (VNĐ)';
  $('mInsSalary').classList.toggle('hidden', m.insMode !== 'custom');
  $('mResult').innerHTML = m.amount ? renderReport(monthReport())
    : '<div class="card p-5 text-center text-slate-500">Nhập mức lương để xem kết quả</div>';
}

$('view-month').addEventListener('input', () => { readMonth(); renderMonth(); });
$('view-month').addEventListener('change', () => { readMonth(); renderMonth(); });
$('mMode').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (!v) return; m.mode = v; setSeg('mMode', v); store.set('month', m); renderMonth(); };
$('mInsMode').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (!v) return; m.insMode = v; setSeg('mInsMode', v); store.set('month', m); renderMonth(); };
document.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
  const el = $(b.dataset.step); el.value = Math.max(0, int(el) + +b.dataset.d);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

// ================= Tab Quyết toán năm =================
const emptyYear = () => ({ region: 1, months: Array.from({ length: 12 }, () => ({ taxable: 0, ins: 0, withheld: 0 })), depMonths: 0, otherInc: 0, otherTax: 0, charity: 0, pension: 0 });
let yearSel = store.get('yearSel', 2026);
if (!YEARS.includes(yearSel)) yearSel = Math.max(...YEARS);
let yd = store.get('year:' + yearSel, emptyYear());

function buildRows() {
  $('yRows').innerHTML = yd.months.map((r, i) => `
    <tr>
      <td class="py-1 text-slate-500">${i + 1}</td>
      <td><input data-money inputmode="numeric" data-i="${i}" data-k="taxable" value="${r.taxable ? fmt(r.taxable) : ''}"></td>
      <td><input data-money inputmode="numeric" data-i="${i}" data-k="ins" value="${r.ins ? fmt(r.ins) : ''}"></td>
      <td><input data-money inputmode="numeric" data-i="${i}" data-k="withheld" value="${r.withheld ? fmt(r.withheld) : ''}"></td>
    </tr>`).join('');
}

function loadYear() {
  $('yYear').value = yearSel;
  $('yRegion').value = yd.region;
  buildRows();
  $('yDepMonths').value = yd.depMonths;
  for (const [id, k] of [['yOtherInc', 'otherInc'], ['yOtherTax', 'otherTax'], ['yCharity', 'charity'], ['yPension', 'pension']]) $(id).value = yd[k] ? fmt(yd[k]) : '';
}

function readYear() {
  yd.region = +$('yRegion').value;
  yd.depMonths = int($('yDepMonths'));
  yd.otherInc = money($('yOtherInc')); yd.otherTax = money($('yOtherTax'));
  yd.charity = money($('yCharity')); yd.pension = money($('yPension'));
  $('yRows').querySelectorAll('input').forEach((el) => { yd.months[+el.dataset.i][el.dataset.k] = money(el); });
  store.set('year:' + yearSel, yd);
}

export function yearReport() {
  const r = annualSettlement({
    year: yearSel, months: yd.months, dependentMonths: yd.depMonths,
    other: { income: yd.otherInc, withheld: yd.otherTax }, charity: yd.charity, pension: yd.pension,
  });
  const pay = r.diff > 0.5, refund = r.diff < -0.5;
  return {
    title: `Quyết toán thuế TNCN năm ${yearSel}`,
    subtitle: r.rules.label,
    highlight: {
      label: pay ? 'Số thuế phải nộp thêm' : refund ? 'Số thuế được hoàn' : 'Không phát sinh chênh lệch',
      value: `${fmt(Math.abs(r.diff))} ₫`, tone: pay ? 'bad' : refund ? 'good' : '',
      sub: `Thuế phải nộp cả năm ${fmt(r.tax.total)} ₫ · Đã khấu trừ ${fmt(r.withheld)} ₫`,
    },
    sections: [
      { heading: 'Tổng hợp cả năm', rows: [
        ['Tổng thu nhập chịu thuế', fmt(r.taxable), { bold: true }],
        ['Giảm trừ bản thân (12 tháng)', `− ${fmt(r.personal)}`],
        [`Giảm trừ người phụ thuộc (${yd.depMonths} tháng)`, `− ${fmt(r.dependent)}`, { muted: !r.dependent }],
        ['Bảo hiểm bắt buộc', `− ${fmt(r.ins)}`],
        ['Từ thiện, nhân đạo, khuyến học', `− ${fmt(r.charity)}`, { muted: !r.charity }],
        ['Quỹ hưu trí tự nguyện', `− ${fmt(r.pension)}`, { muted: !r.pension }],
        ['Thu nhập tính thuế', fmt(r.ti), { bold: true }],
        ['Thuế TNCN phải nộp cả năm', fmt(r.tax.total), { bold: true }],
        ['Thuế đã khấu trừ / tạm nộp', `− ${fmt(r.withheld)}`],
        [pay ? 'Phải nộp thêm' : 'Được hoàn / bù trừ', fmt(Math.abs(r.diff)), { bold: true, tone: pay ? 'bad' : 'good' }],
      ] },
      { heading: 'Thuế theo bậc (biểu năm)', rows: r.ti ? bracketRows(r.tax) : [['Không phải nộp thuế', '0', { muted: true }]],
        note: 'Ngưỡng biểu thuế năm = ngưỡng tháng × 12.' },
      { heading: 'Chi tiết theo tháng', rows: yd.months.map((x, i) => [
        `Tháng ${i + 1}`, `${fmt(x.taxable)} · BH ${fmt(x.ins)} · Thuế ${fmt(x.withheld)}`, { muted: !x.taxable },
      ]) },
    ],
  };
}

function renderYear() {
  const has = yd.months.some((x) => x.taxable) || yd.otherInc;
  $('yResult').innerHTML = has ? renderReport(yearReport())
    : '<div class="card p-5 text-center text-slate-500">Nhập thu nhập các tháng (hoặc dùng “Điền nhanh”) để xem kết quả quyết toán</div>';
}

$('view-year').addEventListener('input', (e) => { if (e.target.closest('#yQuick')) return; readYear(); renderYear(); });
$('yRegion').onchange = () => { readYear(); renderYear(); };
$('yYear').onchange = () => {
  yearSel = +$('yYear').value; store.set('yearSel', yearSel);
  yd = store.get('year:' + yearSel, emptyYear()); loadYear(); renderYear();
};
$('yClear').onclick = () => {
  if (!confirm(`Xoá toàn bộ số liệu năm ${yearSel}?`)) return;
  yd = emptyYear(); store.set('year:' + yearSel, yd); loadYear(); renderYear();
};
$('qFill').onclick = () => {
  const gross = money($('qGross'));
  if (!gross) { $('qGross').focus(); return; }
  const ins = money($('qIns')) || gross, exempt = money($('qExempt')), dep = int($('qDep')), bonus = money($('qBonus'));
  readYear();
  yd.months = yd.months.map((_, i) => {
    const ym = `${yearSel}-${String(i + 1).padStart(2, '0')}`;
    const g = gross + (i === 11 ? bonus : 0);
    const r = grossToNet({ gross: g, insSalary: ins, exempt, dependents: dep, region: yd.region, ym });
    return { taxable: r.taxable, ins: Math.round(r.ins.total), withheld: Math.round(r.tax.total) };
  });
  yd.depMonths = dep * 12;
  store.set('year:' + yearSel, yd);
  loadYear(); renderYear();
  $('yQuick').open = false;
};

// ================= Tab Biểu thuế =================
function renderInfo() {
  const ym = nowYm;
  const brk = (rules) => rules.brackets.map(([top, rate], i, a) => {
    const from = i ? a[i - 1][0] : 0;
    return [`Bậc ${i + 1}: ${top === Infinity ? `trên ${fmt(from)}` : `${i ? 'trên ' + fmt(from) + ' – ' : 'đến '}${fmt(top)}`}`, pct(rate)];
  });
  const sections = YEARS.map((y) => {
    const r = RULES[y];
    return { heading: `Kỳ tính thuế ${r.label}`, rows: [
      ['Giảm trừ bản thân / tháng', fmt(r.personal), { bold: true }],
      ['Giảm trừ mỗi người phụ thuộc / tháng', fmt(r.dependent), { bold: true }],
      ['Biểu thuế (thu nhập tính thuế / tháng)', '', { muted: true }],
      ...brk(r).map(([a, b]) => [a, b, { indent: true }]),
    ], note: r.note };
  });
  sections.push({ heading: 'Bảo hiểm bắt buộc (người lao động)', rows: [
    ['BHXH / BHYT / BHTN', `${pct(INSURANCE.rates.bhxh)} / ${pct(INSURANCE.rates.bhyt)} / ${pct(INSURANCE.rates.bhtn)}`],
    ['Mức tham chiếu (lương cơ sở) hiện tại', fmt(baseSalary(ym))],
    ['Trần BHXH, BHYT (20 × mức tham chiếu)', fmt(20 * baseSalary(ym))],
    ...[1, 2, 3, 4].map((v) => [`Lương tối thiểu vùng ${['I', 'II', 'III', 'IV'][v - 1]} · trần BHTN`, `${fmt(regionMin(ym, v))} · ${fmt(20 * regionMin(ym, v))}`, { indent: true }]),
  ], note: 'Mức tham chiếu 2.340.000 đến 30/6/2026, 2.530.000 từ 1/7/2026. Lương tối thiểu vùng 2026 theo NĐ 293/2025/NĐ-CP. App tự chọn mức theo kỳ lương bạn nhập.' });
  $('view-info').innerHTML = renderReport({ sections });
}

// ================= Điều hướng tab =================
const SUB = { month: 'Lương & thuế TNCN hằng tháng', year: 'Quyết toán thuế TNCN năm', info: 'Biểu thuế & tham số áp dụng' };
function showTab(t) {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  for (const k of ['month', 'year', 'info']) $('view-' + k).classList.toggle('hidden', k !== t);
  $('subtitle').textContent = SUB[t];
  store.set('tab', t);
  scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach((b) => b.onclick = () => showTab(b.dataset.tab));

loadMonth(); renderMonth();
loadYear(); renderYear();
renderInfo();
showTab(store.get('tab', 'month'));

// Cho phép mở console thử nhanh / sau này dùng cho xuất PDF, Excel
window.YuhTax = { monthReport, yearReport, grossToNet, netToGross, annualSettlement, insurance, rulesFor };

registerPWA();
