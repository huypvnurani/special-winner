import { registerPWA } from './pwa.js';
import { initStore, store, exportAll, importAll } from './db.js';
import { normalizeMonth, normalizeYear, normalizeSource } from './datafile.js';
import { exportPDF, exportXLSX, saveBlob } from './export.js';
import { RULES, YEARS, INSURANCE, MEAL_EXEMPT, FLAT, baseSalary, regionMin, rulesFor, grossToNet, netToGross, annualSettlement, insurance } from './tax.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
const pct = (r) => `${+(r * 100).toFixed(2)}%`.replace('.', ',');
const money = (el) => +String(el.value).replace(/\D/g, '') || 0;
const int = (el) => Math.max(0, parseInt(String(el.value).replace(/\D/g, ''), 10) || 0);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Lưu trữ: IndexedDB trên máy người dùng (db.js), nạp xong mới dựng giao diện ----------
await initStore();

// ---------- Ô nhập tiền: tự thêm dấu chấm ngăn cách ----------
function formatMoneyInput(el) {
  const n = money(el);
  el.value = n ? fmt(n) : '';
}
document.addEventListener('input', (e) => { if (e.target.matches('[data-money]')) formatMoneyInput(e.target); });

// ---------- Báo cáo: dữ liệu chung cho màn hình, PDF và Excel (export.js) ----------
// report = { title, subtitle, highlight: {label, value, tone, sub}, sections: [{ heading, rows: [[label, value, opts]], note }],
//            tables: [{ heading, sheet, head: [...], body: [[...]], foot: [...] }] }
// opts: { bold, muted, indent, tone: 'good'|'bad' }
function renderReport(r) {
  const tone = { good: 'text-emerald-600', bad: 'text-brand-dark' };
  const hl = r.highlight ? `
    <div class="card p-5 text-center">
      <p class="text-sm text-slate-500">${esc(r.highlight.label)}</p>
      <p class="text-3xl font-bold num mt-1 ${tone[r.highlight.tone] || 'text-brand-dark'}">${esc(r.highlight.value)}</p>
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
  const cell = (c) => typeof c === 'number' ? fmt(c) : esc(c);
  const tables = (r.tables || []).map((t) => `
    <div class="card p-4">
      <h3 class="font-semibold mb-1">${esc(t.heading)}</h3>
      <div class="overflow-x-auto"><table class="w-full text-sm num">
        <thead class="text-xs text-slate-500"><tr>${t.head.map((h, i) => `<th class="py-1 ${i ? 'text-right pl-2' : 'text-left'}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${t.body.map((row) => `<tr class="border-t border-slate-100">${row.map((c, i) => `<td class="py-1 ${i ? 'text-right pl-2' : 'text-slate-500'}">${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        ${t.foot ? `<tfoot class="font-semibold border-t-2 border-slate-200"><tr>${t.foot.map((c, i) => `<td class="py-1 ${i ? 'text-right pl-2' : ''}">${cell(c)}</td>`).join('')}</tr></tfoot>` : ''}
      </table></div>
    </div>`).join('');
  return hl + secs + tables;
}

// Nút xuất file dưới kết quả
const exportBar = (kind) => `
  <div class="grid grid-cols-2 gap-3">
    <button data-export="pdf" data-kind="${kind}" class="rounded-xl bg-brand text-brand-fg font-semibold py-3 active:opacity-80"><i class="fa-solid fa-file-pdf mr-1" aria-hidden="true"></i> Xuất PDF</button>
    <button data-export="xlsx" data-kind="${kind}" class="rounded-xl bg-white border border-brand text-brand font-semibold py-3 active:bg-brand-soft"><i class="fa-solid fa-file-excel mr-1" aria-hidden="true"></i> Xuất Excel</button>
  </div>`;

const bracketRows = (tax) => tax.rows.map((b) => [
  `${pct(b.rate)}: ${b.to === Infinity ? `trên ${fmt(b.from)}` : `${fmt(b.from)} – ${fmt(b.to)}`}`,
  fmt(b.tax), { indent: true, muted: !b.part },
]);

// ================= Tab Lương tháng =================
const m = normalizeMonth(store.get('month'));
const nowYm = new Date().toISOString().slice(0, 7);
if (m.ym && !YEARS.includes(+m.ym.slice(0, 4))) m.ym = null;   // năm app không còn hỗ trợ

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
  $('mSync').checked = m.syncYear;
  $('mContract').value = m.contract;
  $('mMeal').value = m.meal ? fmt(m.meal) : '';
  $('mUnion').checked = m.union;
}

function readMonth() {
  Object.assign(m, {
    amount: money($('mAmount')), ym: $('mYm').value || nowYm, region: +$('mRegion').value,
    dep: int($('mDep')), insSalary: money($('mInsSalary')), exempt: money($('mExempt')), syncYear: $('mSync').checked,
    contract: $('mContract').value, meal: money($('mMeal')), union: $('mUnion').checked,
  });
  store.set('month', m);
}

function computeMonth() {
  const opt = {
    ym: m.ym || nowYm, region: m.region, dependents: m.dep, exempt: m.exempt,
    insSalary: m.insMode === 'custom' ? m.insSalary : null,
    contract: m.contract, meal: m.meal, union: m.union,
  };
  return m.mode === 'g2n' ? grossToNet({ ...opt, gross: m.amount }) : netToGross({ ...opt, net: m.amount });
}

export function monthReport() {
  const r = computeMonth();
  const [y, mo] = (m.ym || nowYm).split('-');
  const short = r.contract === 'short';
  const insNote = [
    r.ins.raisedToFloor && `Lương đóng BH thấp hơn lương tối thiểu vùng nên được nâng lên ${fmt(r.ins.floor)}`,
    r.ins.cappedSH && `BHXH/BHYT tính trên mức trần ${fmt(r.ins.capSH)}`,
    r.ins.cappedTN && `BHTN tính trên mức trần ${fmt(r.ins.capTN)}`,
  ].filter(Boolean).join('; ');
  const detail = short ? [
    ['Lương Gross', fmt(r.gross), { bold: true }],
    ['Bảo hiểm bắt buộc', 'Không đóng', { muted: true }],
    [`Phụ cấp ăn trưa miễn thuế (≤ ${fmt(MEAL_EXEMPT)})`, `− ${fmt(r.mealExempt)}`, { muted: !r.mealExempt }],
    ['Thu nhập miễn thuế khác', `− ${fmt(r.exempt)}`, { muted: !r.exempt }],
    ['Thu nhập chịu thuế', fmt(r.taxable), { bold: true }],
    [`Thuế khấu trừ ${pct(FLAT.rate)}${r.tax.total ? '' : ` (dưới ${fmt(FLAT.min)} không khấu trừ)`}`, `− ${fmt(r.tax.total)}`, { bold: true, tone: r.tax.total ? 'bad' : '' }],
  ] : [
    ['Lương Gross', fmt(r.gross), { bold: true }],
    [`Bảo hiểm bắt buộc (10,5% × ${fmt(r.ins.base)})`, `− ${fmt(r.ins.total)}`],
    [`BHXH ${pct(INSURANCE.rates.bhxh)}`, fmt(r.ins.bhxh), { indent: true, muted: true }],
    [`BHYT ${pct(INSURANCE.rates.bhyt)}`, fmt(r.ins.bhyt), { indent: true, muted: true }],
    [`BHTN ${pct(INSURANCE.rates.bhtn)}`, fmt(r.ins.bhtn), { indent: true, muted: true }],
    [`Phụ cấp ăn trưa miễn thuế (≤ ${fmt(MEAL_EXEMPT)})`, fmt(r.mealExempt), { muted: !r.mealExempt }],
    ['Thu nhập miễn thuế khác', fmt(r.exempt), { muted: !r.exempt }],
    ['Thu nhập chịu thuế', fmt(r.taxable)],
    ['Giảm trừ bản thân', `− ${fmt(r.personal)}`],
    [`Giảm trừ người phụ thuộc (${m.dep})`, `− ${fmt(r.dependentDeduct)}`, { muted: !m.dep }],
    ['Giảm trừ bảo hiểm', `− ${fmt(r.ins.total)}`],
    ['Thu nhập tính thuế', fmt(r.ti), { bold: true }],
    ['Thuế TNCN', `− ${fmt(r.tax.total)}`, { bold: true, tone: r.tax.total ? 'bad' : '' }],
  ];
  if (r.unionFee) detail.push(['Đoàn phí công đoàn 0,5%', `− ${fmt(r.unionFee)}`]);
  detail.push(['Lương Net', fmt(r.net), { bold: true, tone: 'good' }]);
  return {
    title: `Bảng tính lương tháng ${mo}/${y}`,
    subtitle: short ? `Thử việc riêng / CTV / HĐ dưới 3 tháng · khấu trừ ${pct(FLAT.rate)}`
      : `${r.rules.label} · Vùng ${['I', 'II', 'III', 'IV'][m.region - 1]} · ${m.dep} người phụ thuộc`,
    highlight: m.mode === 'g2n'
      ? { label: 'Lương thực nhận (Net)', value: `${fmt(r.net)} ₫`, sub: `Thuế TNCN ${fmt(r.tax.total)} ₫ · Bảo hiểm ${fmt(r.ins.total)} ₫` }
      : { label: 'Lương Gross cần thoả thuận', value: `${fmt(r.gross)} ₫`, sub: `để nhận về ${fmt(r.net)} ₫` },
    sections: [
      { heading: 'Chi tiết', rows: detail, note: insNote ? insNote + '.' : '' },
      ...(short ? [] : [{ heading: 'Thuế theo từng bậc', rows: r.ti ? bracketRows(r.tax) : [['Thu nhập chưa tới mức phải nộp thuế', '0', { muted: true }]] }]),
      { heading: 'Chi phí công ty trả', rows: [
        ['Lương Gross', fmt(r.gross)],
        [`BHXH ${pct(INSURANCE.employer.bhxh)} (gồm TNLĐ-BNN)`, fmt(r.ins.employer.bhxh), { indent: true, muted: true }],
        [`BHYT ${pct(INSURANCE.employer.bhyt)}`, fmt(r.ins.employer.bhyt), { indent: true, muted: true }],
        [`BHTN ${pct(INSURANCE.employer.bhtn)}`, fmt(r.ins.employer.bhtn), { indent: true, muted: true }],
        [`Kinh phí công đoàn ${pct(INSURANCE.employer.kpcd)}`, fmt(r.ins.employer.kpcd), { indent: true, muted: true }],
        ['Tổng chi phí', fmt(r.employerCost), { bold: true }],
      ] },
    ],
  };
}

// Ghi kết quả tháng đang tính vào đúng tháng đó của quyết toán năm
function syncToYear() {
  const ym = m.ym || nowYm, y = +ym.slice(0, 4), i = +ym.slice(5, 7) - 1;
  if (!m.syncYear || !m.amount || !YEARS.includes(y)) return;
  const r = computeMonth();
  const target = y === yearSel ? yd : normalizeYear(store.get('year:' + y));
  target.months[i] = { ...target.months[i], taxable: Math.round(r.taxable), ins: Math.round(r.ins.total), withheld: Math.round(r.tax.total), dep: m.dep };
  store.set('year:' + y, target);
  if (y === yearSel) { yd = target; loadYear(); renderYear(); }
}

function renderMonth(sync = false) {
  $('mAmountLbl').textContent = m.mode === 'g2n' ? 'Lương Gross / tháng (VNĐ)' : 'Lương Net mong muốn / tháng (VNĐ)';
  $('mModeHint').textContent = m.mode === 'g2n'
    ? 'Gross → Net: nhập lương Gross (trước bảo hiểm & thuế, ghi trong hợp đồng) để biết số tiền thực nhận.'
    : 'Net → Gross: nhập số tiền muốn nhận về tay để biết cần thoả thuận lương Gross bao nhiêu.';
  $('mInsSalary').classList.toggle('hidden', m.insMode !== 'custom');
  document.querySelectorAll('#view-month [data-ld]').forEach((el) => el.classList.toggle('hidden', m.contract === 'short'));
  $('mResult').innerHTML = m.amount ? renderReport(monthReport()) + exportBar('month')
    : '<div class="card p-5 text-center text-slate-500">Nhập mức lương để xem kết quả</div>';
  const [y, mo] = (m.ym || nowYm).split('-');
  $('mSyncInfo').textContent = !m.syncYear ? 'Đang tắt: chỉ tính thử, không ghi vào quyết toán.'
    : `Kết quả được ghi vào Tháng ${+mo}/${y} trong tab Quyết toán năm.`;
  // Chỉ ghi khi người dùng thao tác (không ghi lúc mở app → không đè số đã sửa tay bên quyết toán)
  if (sync) syncToYear();
}

const onMonthEdit = () => { readMonth(); renderMonth(true); };
$('view-month').addEventListener('input', onMonthEdit);
$('view-month').addEventListener('change', onMonthEdit);
$('mMode').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (!v) return; m.mode = v; setSeg('mMode', v); store.set('month', m); renderMonth(true); };
$('mInsMode').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (!v) return; m.insMode = v; setSeg('mInsMode', v); store.set('month', m); renderMonth(true); };
document.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
  const el = $(b.dataset.step); el.value = Math.max(0, int(el) + +b.dataset.d);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

// ================= Tab Quyết toán năm =================
const emptyYear = () => normalizeYear({});
let yearSel = +store.get('yearSel', 0);
if (!YEARS.includes(yearSel)) yearSel = YEARS.includes(+nowYm.slice(0, 4)) ? +nowYm.slice(0, 4) : Math.max(...YEARS);
let yd = normalizeYear(store.get('year:' + yearSel));
// Số tháng người phụ thuộc: tự cộng từ từng tháng (depAuto), người dùng sửa tay thì giữ số tay
const depMonthsOf = (d) => d.depAuto ? d.months.reduce((s, x) => s + x.dep, 0) : d.depMonths;
const KIND = { ld: 'Hợp đồng lao động', vl: 'Vãng lai (khấu trừ 10%)' };

function buildRows() {
  $('yRows').innerHTML = yd.months.map((r, i) => `
    <tr>
      <td class="py-1 text-slate-500">${i + 1}</td>
      <td><input data-money inputmode="numeric" data-i="${i}" data-k="taxable" value="${r.taxable ? fmt(r.taxable) : ''}"></td>
      <td><input data-money inputmode="numeric" data-i="${i}" data-k="ins" value="${r.ins ? fmt(r.ins) : ''}"></td>
      <td><input data-money inputmode="numeric" data-i="${i}" data-k="withheld" value="${r.withheld ? fmt(r.withheld) : ''}"></td>
    </tr>`).join('');
}

function buildSources() {
  const val = (n) => (n ? fmt(n) : '');
  $('ySources').innerHTML = yd.sources.map((s, i) => `
    <div class="rounded-xl border border-slate-200 p-3 space-y-2">
      <div class="flex gap-2">
        <input class="inp flex-1" data-s="${i}" data-k="name" placeholder="Tên nơi trả thu nhập" value="${esc(s.name)}" />
        <button data-del-src="${i}" class="w-11 shrink-0 rounded-xl bg-rose-50 text-rose-600 font-bold active:bg-rose-100" aria-label="Xoá nguồn"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
      </div>
      <select class="inp" data-s="${i}" data-k="kind">
        ${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <div class="grid grid-cols-2 gap-2">
        <div class="col-span-2"><span class="lbl">Thu nhập chịu thuế cả năm</span><input class="inp num" data-money inputmode="numeric" data-s="${i}" data-k="income" value="${val(s.income)}" /></div>
        <div><span class="lbl">BH bắt buộc đã đóng</span><input class="inp num" data-money inputmode="numeric" data-s="${i}" data-k="ins" value="${val(s.ins)}" /></div>
        <div><span class="lbl">Thuế đã khấu trừ</span><input class="inp num" data-money inputmode="numeric" data-s="${i}" data-k="withheld" value="${val(s.withheld)}" /></div>
      </div>
    </div>`).join('');
}

function loadYear() {
  $('yYear').value = yearSel;
  $('yRegion').value = yd.region;
  buildRows();
  buildSources();
  $('yDepMonths').value = depMonthsOf(yd);
  $('yDepHint').textContent = yd.depAuto ? 'Đang tự cộng từ số người phụ thuộc từng tháng. Sửa tay nếu khác.' : 'Đang dùng số bạn nhập tay.';
  for (const [id, k] of [['yCharity', 'charity'], ['yPension', 'pension']]) $(id).value = yd[k] ? fmt(yd[k]) : '';
}

function readYear() {
  yd.region = +$('yRegion').value;
  if (!yd.depAuto) yd.depMonths = int($('yDepMonths'));
  yd.charity = money($('yCharity')); yd.pension = money($('yPension'));
  $('yRows').querySelectorAll('input').forEach((el) => { yd.months[+el.dataset.i][el.dataset.k] = money(el); });
  $('ySources').querySelectorAll('[data-s]').forEach((el) => {
    const s = yd.sources[+el.dataset.s], k = el.dataset.k;
    s[k] = k === 'name' || k === 'kind' ? el.value : money(el);
  });
  store.set('year:' + yearSel, yd);
}

export function yearReport() {
  const depMonths = depMonthsOf(yd);
  const r = annualSettlement({
    year: yearSel, months: yd.months, dependentMonths: depMonths,
    others: yd.sources, charity: yd.charity, pension: yd.pension,
  });
  const srcName = (s, i) => s.name.trim() || `Nguồn khác ${i + 1}`;
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
        ...(yd.sources.length ? [
          ['Nguồn chính (12 tháng)', fmt(r.main.taxable), { indent: true, muted: true }],
          ...yd.sources.map((s, i) => [srcName(s, i), fmt(s.income), { indent: true, muted: true }]),
        ] : []),
        ['Giảm trừ bản thân (12 tháng)', `− ${fmt(r.personal)}`],
        [`Giảm trừ người phụ thuộc (${depMonths} tháng)`, `− ${fmt(r.dependent)}`, { muted: !r.dependent }],
        ['Bảo hiểm bắt buộc', `− ${fmt(r.ins)}`],
        ['Từ thiện, nhân đạo, khuyến học', `− ${fmt(r.charity)}`, { muted: !r.charity }],
        ['Quỹ hưu trí tự nguyện', `− ${fmt(r.pension)}`, { muted: !r.pension }],
        ['Thu nhập tính thuế', fmt(r.ti), { bold: true }],
        ['Thuế TNCN phải nộp cả năm', fmt(r.tax.total), { bold: true }],
        ['Thuế đã khấu trừ / tạm nộp', `− ${fmt(r.withheld)}`],
        [pay ? 'Phải nộp thêm' : 'Được hoàn / bù trừ', fmt(Math.abs(r.diff)), { bold: true, tone: pay ? 'bad' : 'good' }],
      ], note: yd.sources.length ? 'Có thu nhập từ nhiều nơi thì thường phải tự quyết toán với cơ quan thuế (mẫu 02/QTT-TNCN). Nếu chỉ có thêm thu nhập vãng lai bình quân không quá 10 triệu/tháng và đã khấu trừ 10% thì vẫn có thể uỷ quyền cho công ty quyết toán.' : '' },
      { heading: 'Thuế theo bậc (biểu năm)', rows: r.ti ? bracketRows(r.tax) : [['Không phải nộp thuế', '0', { muted: true }]],
        note: 'Ngưỡng biểu thuế năm = ngưỡng tháng × 12.' },
    ],
    tables: [{
      heading: 'Chi tiết theo tháng', sheet: 'Chi tiết 12 tháng',
      head: ['Tháng', 'TN chịu thuế', 'BH bắt buộc', 'Thuế đã khấu trừ'],
      body: yd.months.map((x, i) => [`Tháng ${i + 1}`, x.taxable, x.ins, x.withheld]),
      foot: ['Cộng', ...['taxable', 'ins', 'withheld'].map((k) => yd.months.reduce((s, x) => s + x[k], 0))],
    }, ...(yd.sources.length ? [{
      heading: 'Nguồn thu nhập khác', sheet: 'Nguồn khác',
      head: ['Nguồn', 'Loại', 'Thu nhập', 'BH bắt buộc', 'Thuế đã khấu trừ'],
      body: yd.sources.map((s, i) => [srcName(s, i), KIND[s.kind], s.income, s.ins, s.withheld]),
      foot: ['Cộng', '', r.other.taxable, r.other.ins, r.other.withheld],
    }] : [])],
  };
}

function renderYear() {
  const has = yd.months.some((x) => x.taxable) || yd.sources.some((s) => s.income);
  $('yResult').innerHTML = has ? renderReport(yearReport()) + exportBar('year')
    : '<div class="card p-5 text-center text-slate-500">Nhập thu nhập các tháng (hoặc dùng “Điền nhanh”) để xem kết quả quyết toán</div>';
}

$('view-year').addEventListener('input', (e) => {
  if (e.target.closest('#yQuick')) return;
  if (e.target.id === 'yDepMonths' && yd.depAuto) { yd.depAuto = false; yd.depMonths = int(e.target); $('yDepHint').textContent = 'Đang dùng số bạn nhập tay.'; }
  readYear(); renderYear();
});
$('yAddSource').onclick = () => {
  readYear();
  yd.sources.push(normalizeSource({}));
  store.set('year:' + yearSel, yd);
  buildSources(); renderYear();
  $('ySources').lastElementChild?.querySelector('input')?.focus();
};
$('ySources').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del-src]');
  if (!b) return;
  readYear();
  const s = yd.sources[+b.dataset.delSrc];
  if ((s.name || s.income) && !confirm(`Xoá nguồn "${s.name || 'chưa đặt tên'}"?`)) return;
  yd.sources.splice(+b.dataset.delSrc, 1);
  store.set('year:' + yearSel, yd);
  buildSources(); renderYear();
});
$('yRegion').onchange = () => { readYear(); renderYear(); };
$('yYear').onchange = () => {
  yearSel = +$('yYear').value; store.set('yearSel', yearSel);
  yd = normalizeYear(store.get('year:' + yearSel)); loadYear(); renderYear();
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
    return { taxable: Math.round(r.taxable), ins: Math.round(r.ins.total), withheld: Math.round(r.tax.total), dep };
  });
  yd.depAuto = true;
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

// ================= Xuất PDF / Excel =================
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-export]');
  if (!b || b.disabled) return;
  const isYear = b.dataset.kind === 'year';
  const report = isYear ? yearReport() : monthReport();
  const name = isYear ? `YuhTahnTax_QuyetToan_${yearSel}` : `YuhTahnTax_Luong_${m.ym || nowYm}`;
  const label = b.innerHTML;
  b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1" aria-hidden="true"></i> Đang tạo file…';
  try {
    if (b.dataset.export === 'pdf') await exportPDF(report, name + '.pdf');
    else await exportXLSX(report, name + '.xlsx');
  } catch (err) {
    console.error(err);
    alert('Không xuất được file: ' + err.message);
  } finally {
    b.disabled = false; b.innerHTML = label;
  }
});

// ================= Sao lưu / mở file .yuhtax =================
async function saveData() {
  const day = new Date().toLocaleDateString('sv');   // YYYY-MM-DD
  await saveBlob(new Blob([exportAll()], { type: 'application/octet-stream' }), `YuhTahnTax_DuLieu_${day}.yuhtax`);
}
const ACTIONS = { save: saveData, open: () => $('fileOpen').click() };

// Menu ☰ (điện thoại)
const setMenu = (open) => { $('menu').classList.toggle('hidden', !open); $('btnMenu').setAttribute('aria-expanded', String(open)); };
$('btnMenu').onclick = (e) => { e.stopPropagation(); setMenu($('menu').classList.contains('hidden')); };
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (a) { setMenu(false); ACTIONS[a.dataset.action]?.(); return; }
  if (!e.target.closest('#menu')) setMenu(false);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
$('fileOpen').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/\.(yuhtax|json)$/i.test(file.name)) { alert('Hãy chọn file có đuôi .yuhtax'); return; }
  if (!confirm(`Mở "${file.name}" sẽ thay toàn bộ dữ liệu đang có trên máy này. Tiếp tục?`)) return;
  try {
    const f = await importAll(await file.text());
    alert(`Đã nạp dữ liệu (lưu lúc ${new Date(f.exportedAt).toLocaleString('vi-VN')}).`);
    location.reload();
  } catch (err) {
    alert('Không mở được file: ' + err.message);
  }
};

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
const savedTab = store.get('tab', 'month');
showTab(SUB[savedTab] ? savedTab : 'month');

// Mở console thử nhanh
window.YuhTax = { monthReport, yearReport, grossToNet, netToGross, annualSettlement, insurance, rulesFor };

registerPWA();
