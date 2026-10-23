#!/usr/bin/env node
import fs from 'fs';
const readTxt = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const excelBlock = readTxt('excel-block.txt') + '\n\n';
const patch = (file, fn) => {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  s = fn(s);
  if (s == null) { console.log('  (skipped, already applied) ' + file); return; }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log('  patched ' + file);
};

console.log('InspectionDetail.jsx:');
patch('src/pages/InspectionDetail.jsx', (s) => {
  if (s.includes('handleDownloadExcel')) return null;
  let out = s;
  const jspdf = 'import { jsPDF } from "jspdf";';
  if (!out.includes(jspdf)) { console.error('  FAIL: jsPDF import not found'); process.exit(1); }
  out = out.replace(jspdf, jspdf + "\nimport * as XLSX from 'xlsx';");
  const pdfMark = '  const handleDownloadPDF = async';
  const pi = out.indexOf(pdfMark);
  if (pi < 0) { console.error('  FAIL: handleDownloadPDF marker not found'); process.exit(1); }
  out = out.slice(0, pi) + excelBlock + out.slice(pi);
  const exportMark = '      {/* Export Buttons */}';
  const ei = out.indexOf(exportMark);
  if (ei < 0) { console.error('  FAIL: Export Buttons comment not found'); process.exit(1); }
  const excelCard =
`      {/* Excel (Interno) — supervisor/admin only */}
      {canReview && (
        <div className="card" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>📊 Exportar Excel (Interno)</div>
          <button className="btn btn-success btn-sm" onClick={handleDownloadExcel}>
            <Icon name="download" size={13} /> Excel (.xlsx)
          </button>
        </div>
      )}

`;
  out = out.slice(0, ei) + excelCard + out.slice(ei);
  return out;
});

console.log('Dashboards.jsx:');
patch('src/pages/Dashboards.jsx', (s) => {
  if (s.includes('ScoreTrendChart')) return null;
  let out = s;
  const recharts = 'import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";';
  if (!out.includes(recharts)) { console.error('  FAIL: recharts import not found'); process.exit(1); }
  out = out.replace(recharts, recharts + '\nimport ScoreTrendChart from "../components/ScoreTrendChart";');
  const twoColBlock =
`      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12, color: "#A32D2D" }}>Lowest Scoring Categories (Company-wide)</h3>`;
  if (!out.includes(twoColBlock)) { console.error('  FAIL: SupervisorDashboard two-col block not found'); process.exit(1); }
  out = out.replace(twoColBlock, '      <ScoreTrendChart inspections={inspections} />\n\n' + twoColBlock);
  return out;
});
console.log('Done. Run: npm run dev');
