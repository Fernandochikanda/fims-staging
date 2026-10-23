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
  const OLD = `export function CEODashboard({ inspections, locations, auditLogs, currentUser }) {
  return <CEODashboardView inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} />;
}`;
  const NEW = `export function CEODashboard({ inspections, locations, auditLogs, currentUser, onView }) {
  return <CEODashboardView inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} onView={onView} />;
}`;
  if (s.includes(NEW)) return null;
  if (!s.includes(OLD)) { console.error('  FAIL: CEODashboard thin wrapper not found (apply Feature 5 first)'); process.exit(1); }
  return s.replace(OLD, NEW);
});
console.log('App.jsx:');
patch('src/App.jsx', (s) => {
  const OLD = '<CEODashboard inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} />';
  const NEW = '<CEODashboard inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} onView={handleViewInspection} />';
  if (s.includes(NEW)) return null;
  if (!s.includes(OLD)) { console.error('  FAIL: CEODashboard render not found in App.jsx'); process.exit(1); }
  return s.replace(OLD, NEW);
});
console.log('Done. Run: npm run dev');
