// Xuất báo cáo ra PDF (jsPDF + AutoTable) và Excel (SheetJS).
// Thư viện chỉ tải khi người dùng bấm xuất lần đầu → app mở nhanh. Font Be Vietnam Pro (OFL) nằm trong /fonts.
// report = { title, subtitle, highlight: {label, value, sub}, sections: [{ heading, rows: [[label, value, opts]], note }],
//            tables: [{ heading, sheet, head: [...], body: [[...]], foot: [...] }] }

const LIBS = {
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
};
const FONTS = { normal: 'fonts/BeVietnamPro-400Regular.ttf', bold: 'fonts/BeVietnamPro-700Bold.ttf' };
const BRAND = [201, 82, 77];   // #C9524D
const SOFT = [251, 236, 232];

const loaded = {};
function loadScript(url) {
  return loaded[url] ??= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = url; s.onload = ok;
    s.onerror = () => { delete loaded[url]; fail(new Error('Không tải được thư viện, kiểm tra kết nối mạng.')); };
    document.head.appendChild(s);
  });
}

let fontData;
async function loadFonts() {
  if (fontData) return fontData;
  const b64 = async (url) => {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const [normal, bold] = await Promise.all([b64(FONTS.normal), b64(FONTS.bold)]);
  return (fontData = { normal, bold });
}

const stamp = () => new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

// Lưu file: điện thoại → bảng chia sẻ (lưu vào Tệp, in, gửi Zalo…); máy tính → tải về.
export async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// "− 3.150.000" / "3.150.000 ₫" → số; chuỗi khác giữ nguyên
export function toNumber(v) {
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^([−-])?\s*([\d.]+)(\s*₫)?$/);
  if (!m || !/\d/.test(m[2])) return v;
  const n = +m[2].replace(/\./g, '');
  return m[1] ? -n : n;
}

// ================= PDF =================
export async function exportPDF(report, filename) {
  const [fonts] = await Promise.all([loadFonts(), loadScript(LIBS.jspdf).then(() => loadScript(LIBS.autotable))]);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.addFileToVFS('BVP-Regular.ttf', fonts.normal); doc.addFont('BVP-Regular.ttf', 'BVP', 'normal');
  doc.addFileToVFS('BVP-Bold.ttf', fonts.bold); doc.addFont('BVP-Bold.ttf', 'BVP', 'bold');
  doc.setFont('BVP', 'normal');

  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), X = 40;
  let y = 48;

  // Tiêu đề
  doc.setFont('BVP', 'bold').setFontSize(16).setTextColor(...BRAND).text(report.title, X, y);
  doc.setFont('BVP', 'normal').setFontSize(9).setTextColor(100);
  if (report.subtitle) { y += 16; doc.text(report.subtitle, X, y); }

  // Ô kết quả chính
  if (report.highlight) {
    y += 16;
    doc.setFillColor(...SOFT).setDrawColor(...BRAND).roundedRect(X, y, W - 2 * X, report.highlight.sub ? 62 : 48, 6, 6, 'FD');
    doc.setFontSize(10).setTextColor(70).text(report.highlight.label, W / 2, y + 17, { align: 'center' });
    doc.setFont('BVP', 'bold').setFontSize(18).setTextColor(...BRAND).text(report.highlight.value, W / 2, y + 38, { align: 'center' });
    doc.setFont('BVP', 'normal');
    if (report.highlight.sub) doc.setFontSize(8.5).setTextColor(100).text(report.highlight.sub, W / 2, y + 53, { align: 'center' });
    y += report.highlight.sub ? 62 : 48;
  }

  const base = { font: 'BVP', fontSize: 9.5, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, textColor: 30, lineColor: 226, lineWidth: 0.5 };
  const tone = { good: [5, 150, 105], bad: [225, 29, 72] };

  for (const s of report.sections) {
    doc.autoTable({
      startY: y + 14, margin: { left: X, right: X }, theme: 'grid', styles: base,
      head: [[{ content: s.heading, colSpan: 2 }]],
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 10.5 },
      body: s.rows.map(([l, v, o = {}]) => [
        { content: l, styles: { fontStyle: o.bold ? 'bold' : 'normal', textColor: o.muted ? 130 : 30, cellPadding: { ...base.cellPadding, left: o.indent ? 20 : 6 } } },
        { content: v, styles: { halign: 'right', fontStyle: o.bold ? 'bold' : 'normal', textColor: tone[o.tone] || (o.muted ? 130 : 30) } },
      ]),
      columnStyles: { 1: { cellWidth: 150 } },
    });
    y = doc.lastAutoTable.finalY;
    if (s.note) {
      doc.setFontSize(8).setTextColor(110);
      const lines = doc.splitTextToSize(s.note, W - 2 * X);
      doc.text(lines, X, y + 11); y += 11 * lines.length;
    }
  }

  for (const t of report.tables || []) {
    doc.autoTable({
      startY: y + 14, margin: { left: X, right: X }, theme: 'grid', styles: { ...base, fontSize: 9 },
      head: [[{ content: t.heading, colSpan: t.head.length, styles: { fontSize: 10.5 } }], t.head],
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', halign: 'right' },
      body: t.body.map((r) => r.map((c, i) => ({ content: typeof c === 'number' ? Math.round(c).toLocaleString('vi-VN') : c, styles: { halign: i ? 'right' : 'left' } }))),
      foot: t.foot ? [t.foot.map((c, i) => ({ content: typeof c === 'number' ? Math.round(c).toLocaleString('vi-VN') : c, styles: { halign: i ? 'right' : 'left' } }))] : undefined,
      footStyles: { fillColor: SOFT, textColor: 30, fontStyle: 'bold' },
      didParseCell: (d) => { if (d.section === 'head' && (d.row.index === 0 || d.column.index === 0)) d.cell.styles.halign = 'left'; },
    });
    y = doc.lastAutoTable.finalY;
  }

  // Chân trang mọi trang
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFont('BVP', 'normal').setFontSize(7.5).setTextColor(140);
    doc.text(`Xuất từ YuhTahnTax (yuhtahntax.web.app) lúc ${stamp()} · Kết quả tham khảo, đối chiếu với chứng từ khấu trừ thuế.`, X, H - 24);
    doc.text(`${p}/${pages}`, W - X, H - 24, { align: 'right' });
  }

  await saveBlob(doc.output('blob'), filename);
}

// ================= Excel =================
export async function exportXLSX(report, filename) {
  await loadScript(LIBS.xlsx);
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  // Sheet 1: báo cáo (nhãn | số tiền)
  const aoa = [[report.title], ...(report.subtitle ? [[report.subtitle]] : []), [`Xuất lúc ${stamp()}`], []];
  if (report.highlight) {
    aoa.push([report.highlight.label, toNumber(report.highlight.value)]);
    if (report.highlight.sub) aoa.push([report.highlight.sub]);
    aoa.push([]);
  }
  for (const s of report.sections) {
    aoa.push([s.heading.toUpperCase()]);
    for (const [l, v, o = {}] of s.rows) aoa.push([(o.indent ? '    ' : '') + l, toNumber(v)]);
    if (s.note) aoa.push([s.note]);
    aoa.push([]);
  }
  addSheet(XLSX, wb, aoa, 'Báo cáo', [{ wch: 48 }, { wch: 20 }]);

  // Các bảng chi tiết → mỗi bảng một sheet
  for (const t of report.tables || []) {
    const rows = [[t.heading], [], t.head, ...t.body, ...(t.foot ? [t.foot] : [])];
    addSheet(XLSX, wb, rows, t.sheet || t.heading, t.head.map((_, i) => ({ wch: i ? 18 : 10 })));
  }

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  await saveBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

function addSheet(XLSX, wb, aoa, name, cols) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols;
  for (const ref in ws) if (ref[0] !== '!' && ws[ref].t === 'n') ws[ref].z = '#,##0';   // định dạng 1.000.000
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}
