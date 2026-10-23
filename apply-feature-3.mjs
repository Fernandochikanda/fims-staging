#!/usr/bin/env node
import fs from 'fs';
const readTxt = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const pdfBlock = readTxt('defect-pdf-block.txt') + '\n\n';
const wordBlock = readTxt('defect-word-block.txt') + '\n\n';
const newHA = readTxt('new-handleapprove.txt');
const patch = (file, fn) => {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  s = fn(s);
  if (s == null) { console.log('  (skipped, already applied) ' + file); return; }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log('  patched ' + file);
};

console.log('Sidebar.jsx:');
patch('src/components/Sidebar.jsx', (s) => {
  if (s.includes('id: "defects"')) return null;
  const OLD = '    { id: "alerts", icon: "alert", label: t.alerts, badge: alertCount || null, roles: [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR] },';
  const NEW = OLD + '\n    { id: "defects", icon: "alert", label: "Defeitos", roles: [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR] },';
  if (!s.includes(OLD)) { console.error('  FAIL: alerts nav item not found'); process.exit(1); }
  return s.replace(OLD, NEW);
});

console.log('App.jsx:');
patch('src/App.jsx', (s) => {
  let out = s;
  if (!out.includes('import Defects from "./pages/Defects";')) {
    const imp = 'import Alerts from "./pages/Alerts";';
    if (!out.includes(imp)) { console.error('  FAIL: Alerts import not found'); process.exit(1); }
    out = out.replace(imp, imp + '\nimport Defects from "./pages/Defects";');
  }
  if (!out.includes('page === "defects"')) {
    const OLD =
`          ) : page === "alerts" ? (
            <Alerts inspections={inspections} onView={handleViewInspection} onUpdate={handleUpdateInspection} />
          ) : page === "schedule" ? (`;
    const NEW =
`          ) : page === "alerts" ? (
            <Alerts inspections={inspections} onView={handleViewInspection} onUpdate={handleUpdateInspection} />
          ) : page === "defects" ? (
            <Defects currentUser={currentUser} />
          ) : page === "schedule" ? (`;
    if (!out.includes(OLD)) { console.error('  FAIL: alerts route case not found'); process.exit(1); }
    out = out.replace(OLD, NEW);
  }
  if (out === s) return null;
  return out;
});

console.log('InspectionDetail.jsx:');
patch('src/pages/InspectionDetail.jsx', (s) => {
  if (s.includes('defectService.processInspection')) return null;
  let out = s;
  const r1 = 'import { ROLES } from "../data/constants";';
  if (!out.includes(r1)) { console.error('  FAIL: ROLES import not found'); process.exit(1); }
  out = out.replace(r1, 'import { ROLES, SEED_USERS } from "../data/constants";');
  const r2 = 'import { photoStore } from "../lib/photoStore";';
  if (!out.includes(r2)) { console.error('  FAIL: photoStore import not found'); process.exit(1); }
  out = out.replace(r2, r2 + '\nimport { defectService } from "../services/defectService";\nimport { useComms } from "../context/CommsContext";');
  const r3 = 'const [loading, setLoading] = useState(true);';
  if (!out.includes(r3)) { console.error('  FAIL: loading useState not found'); process.exit(1); }
  out = out.replace(r3, r3 + '\n  const { notify } = useComms();');
  const HA_START = '  const handleApprove = () => {';
  const HA_END = '  const handleReject = () => {';
  const ha1 = out.indexOf(HA_START);
  const ha2 = out.indexOf(HA_END);
  if (ha1 < 0) { console.error('  FAIL: handleApprove start not found'); process.exit(1); }
  if (ha2 < 0) { console.error('  FAIL: handleReject start not found'); process.exit(1); }
  out = out.slice(0, ha1) + newHA + '\n' + out.slice(ha2);
  const pdfMark = '      // Sections with Items';
  const pi = out.indexOf(pdfMark);
  if (pi < 0) { console.error('  FAIL: PDF marker not found (apply Feature 2 first)'); process.exit(1); }
  out = out.slice(0, pi) + pdfBlock + out.slice(pi);
  const wordMark = '      TEMPLATE_SECTIONS.forEach(section => {';
  const wi = out.indexOf(wordMark);
  if (wi < 0) { console.error('  FAIL: Word marker not found (apply Feature 2 first)'); process.exit(1); }
  out = out.slice(0, wi) + wordBlock + out.slice(wi);
  return out;
});
console.log('Done. Run: npm run dev');
