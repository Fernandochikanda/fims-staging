#!/usr/bin/env node
import fs from 'fs';
const readTxt = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const excelFn = readTxt('excel-handler.txt') + '\n\n';
const patch = (file, fn) => {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  s = fn(s);
  if (s == null) { console.log('  (skipped, already applied) ' + file); return; }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log('  patched ' + file);
};
console.log('CEODashboardView.jsx:');
patch('src/components/CEODashboardView.jsx', (s) => {
  if (s.includes('handleDownloadExcel')) return null;
  let out = s;
  const mark = '  const handleBoardroomPDF = async';
  const i = out.indexOf(mark);
  if (i < 0) { console.error('  FAIL: handleBoardroomPDF marker not found (Feature 5 applied?)'); process.exit(1); }
  out = out.slice(0, i) + excelFn + out.slice(i);
  const OLD_BTN =
`          <button className="btn btn-sm" onClick={handleBoardroomPDF} title="Exportar Boardroom PDF" style={{ background: "#A32D2D", color: "white" }}>
            <Icon name="download" size={13} /> Boardroom PDF
          </button>`;
  const NEW_BTN =
`          <button className="btn btn-sm" onClick={handleBoardroomPDF} title="Exportar Boardroom PDF" style={{ background: "#A32D2D", color: "white" }}>
            <Icon name="download" size={13} /> Boardroom PDF
          </button>
          <button className="btn btn-sm" onClick={handleDownloadExcel} title="Exportar Excel (5 abas)" style={{ background: "#0F6E56", color: "white" }}>
            <Icon name="download" size={13} /> Excel (.xls)
          </button>`;
  if (!out.includes(OLD_BTN)) { console.error('  FAIL: Boardroom PDF button block not found'); process.exit(1); }
  out = out.replace(OLD_BTN, NEW_BTN);
  return out;
});
console.log('helpers.js:');
patch('src/lib/helpers.js', (s) => {
  if (!s.includes('Acceptable')) return null;
  return s.replace(/Acceptable/g, 'Acima da Média');
});
console.log('Done. Run: npm run dev');
