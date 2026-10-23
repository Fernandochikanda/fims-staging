#!/usr/bin/env node
import fs from 'fs';
const patch = (file, fn) => {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  s = fn(s);
  if (s == null) { console.log('  (skipped, already applied) ' + file); return; }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log('  patched ' + file);
};
console.log('Dashboards.jsx:');
patch('src/pages/Dashboards.jsx', (s) => {
  if (s.includes('CEODashboardView')) return null;
  let out = s;
  const anchor = 'import ScoreRing from "../components/ScoreRing";';
  if (!out.includes(anchor)) { console.error('  FAIL: ScoreRing import not found'); process.exit(1); }
  out = out.replace(anchor, anchor + '\nimport CEODashboardView from "../components/CEODashboardView";');
  const CEO_START = 'export function CEODashboard({ inspections, locations, auditLogs, currentUser }) {';
  const SUP_START = 'export function SupervisorDashboard';
  const c1 = out.indexOf(CEO_START);
  const c2 = out.indexOf(SUP_START);
  if (c1 < 0) { console.error('  FAIL: CEODashboard start not found'); process.exit(1); }
  if (c2 < 0) { console.error('  FAIL: SupervisorDashboard start not found'); process.exit(1); }
  if (c2 <= c1) { console.error('  FAIL: markers in unexpected order'); process.exit(1); }
  const thin =
'export function CEODashboard({ inspections, locations, auditLogs, currentUser }) {\n' +
'  return <CEODashboardView inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} />;\n' +
'}';
  out = out.slice(0, c1) + thin + '\n\n' + out.slice(c2);
  return out;
});
console.log('Done. Run: npm run dev');
