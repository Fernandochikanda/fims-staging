#!/usr/bin/env node
// ============================================================================
//  FIMS — Feature 1: Word report changes for InspectionDetail.jsx
//  1) Removes the "AI Executive Summary / Recommendations" block from the Word (.doc) report.
//  2) Adds a "Category Health Scores" summary (per-category %, colored bar, risk label).
//  3) Splits the single "Word" button into TWO:
//        • Word (Cliente)  -> omits photos of staff/personnel categories (e.g. PESSOAL DE LIMPEZAS)
//        • Word (Interno)  -> full report with ALL photos (current behavior)
//  USAGE: node apply-feature-1.mjs   (run once; safe to re-run — detects already-applied)
//  Works on Windows (CRLF) and Unix (LF) — preserves your line endings.
// ============================================================================
import fs from 'fs';

const FILE = 'src/pages/InspectionDetail.jsx';

const B64 = 'ICBjb25zdCBoYW5kbGVEb3dubG9hZFdvcmQgPSAocmVwb3J0VHlwZSA9ICJpbnRlcm5hbCIpID0+IHsKICAgIHRyeSB7CiAgICAgIGxldCBodG1sID0gYDxodG1sIHhtbG5zOm89J3VybjpzY2hlbWFzLW1pY3Jvc29mdC1jb206b2ZmaWNlOm9mZmljZScgeG1sbnM6dz0ndXJuOnNjaGVtYXMtbWljcm9zb2Z0LWNvbTpvZmZpY2U6d29yZCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnL1RSL1JFQy1odG1sNDAnPjxoZWFkPjxtZXRhIGNoYXJzZXQ9J3V0Zi04Jz48dGl0bGU+RXhwb3J0PC90aXRsZT4KICAgICAgPHN0eWxlPgogICAgICAgIGJvZHkgeyBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7IGZvbnQtc2l6ZTogMTFwdDsgY29sb3I6ICMzMzM7IH0KICAgICAgICBoMSB7IGJhY2tncm91bmQtY29sb3I6ICMxRTJBM0E7IGNvbG9yOiB3aGl0ZTsgcGFkZGluZzogMTBweDsgZm9udC1zaXplOiAxOHB0OyBtYXJnaW4tYm90dG9tOiAyMHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IH0KICAgICAgICBoMiB7IGNvbG9yOiAjMUUyQTNBOyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2NjYzsgcGFkZGluZy1ib3R0b206IDRweDsgZm9udC1zaXplOiAxNHB0OyBtYXJnaW4tdG9wOiAyNHB4OyB9CiAgICAgICAgLm1ldGEgeyBtYXJnaW4tYm90dG9tOiAyMHB4OyBiYWNrZ3JvdW5kOiAjZjhmN2Y0OyBwYWRkaW5nOiAxMHB4OyB9CiAgICAgICAgLm1ldGEgZGl2IHsgbWFyZ2luLWJvdHRvbTogNHB4OyB9CiAgICAgICAgaXRlbSB7IG1hcmdpbi1ib3R0b206IDhweDsgcGFkZGluZy1sZWZ0OiAxMHB4OyBib3JkZXItbGVmdDogM3B4IHNvbGlkICNlZWU7IH0KICAgICAgICAuc2NvcmUgeyBmb250LXdlaWdodDogYm9sZDsgcGFkZGluZzogMnB4IDZweDsgYm9yZGVyLXJhZGl1czogNHB4OyBjb2xvcjogd2hpdGU7IGZvbnQtc2l6ZTogOXB0OyB9CiAgICAgICAgLm9icyB7IGZvbnQtc3R5bGU6IGl0YWxpYzsgY29sb3I6ICM1NTU7IG1hcmdpbi1ib3R0b206IDEwcHg7IGJhY2tncm91bmQ6ICNmOWY5Zjk7IHBhZGRpbmc6IDhweDsgfQogICAgICAgIC5jbXQgeyBjb2xvcjogIzY2NjsgZm9udC1zaXplOiAxMHB0OyBtYXJnaW4tbGVmdDogMTVweDsgfQogICAgICAgIC5xYyB7IGNvbG9yOiAjQTMyRDJEOyBmb250LXNpemU6IDEwcHQ7IG1hcmdpbi1sZWZ0OiAxNXB4OyBmb250LXdlaWdodDogYm9sZDsgfQogICAgICAgIC5waG90by1ncmlkIHsgZGlzcGxheTogZ3JpZDsgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoMywgMWZyKTsgZ2FwOiAxMHB4OyBtYXJnaW4tdG9wOiAxMHB4OyB9CiAgICAgICAgLnBob3RvLWdyaWQgaW1nIHsgd2lkdGg6IDEwMCU7IGhlaWdodDogMTUwcHg7IG9iamVjdC1maXQ6IGNvdmVyOyBib3JkZXI6IDFweCBzb2xpZCAjZGRkOyB9CiAgICAgICAgLmhlYWx0aC1zY29yZXMgeyBtYXJnaW46IDEycHggMDsgfQogICAgICAgIC5oZWFsdGgtcm93IHsgbWFyZ2luLWJvdHRvbTogMTBweDsgfQogICAgICA8L3N0eWxlPgogICAgICA8L2hlYWQ+PGJvZHk+YDsKCiAgICAgIGh0bWwgKz0gYDxoMT5SZWxhdMOzcmlvIGRlIEluc3DpZ8OjbyR7cmVwb3J0VHlwZSA9PT0gImNsaWVudCIgPyAiIOKAlCBDbGllbnRlIiA6ICIg4oCUIEludGVybm8ifTwvaDE+PGRpdiBjbGFzcz0ibWV0YSI+CiAgICAgICAgPGRpdj48c3Ryb25nPkNsaWVudGU6PC9zdHJvbmc+ICR7aW5zcGVjdGlvbi5sb2NhdGlvbl9uYW1lIHx8ICJOL0EifTwvZGl2PgogICAgICAgIDxkaXY+PHN0cm9uZz5EYXRhOjwvc3Ryb25nPiAke25ldyBEYXRlKGluc3BlY3Rpb24uZGF0ZSkudG9Mb2NhbGVEYXRlU3RyaW5kKCJwdC1QVCIpfTwvZGl2PgogICAgICAgIDxkaXY+PHN0cm9uZz5JbnNwZXRvcjo8L3N0cm9uZz4gJHtpbnNwZWN0aW9uLmluc3BlY3Rvcl9uYW1lIHx8ICJOL0EifTwvZGl2PgogICAgICAgIDxkaXY+PHN0cm9uZz5TY29yZSBUb3RhbDo8L3N0cm9uZz4gJHtpbnNwZWN0aW9uLnNjb3JlX3BjdCB8fCAwfSU8L2Rpdj4KICAgICAgPC9kaXY+YDsKCiAgICAgIC8vIPCfk4ogQ2F0ZWdvcnkgSGVhbHRoIFNjb3JlcyAobWlycm9yIG9mIHRoZSBvbi1zY3JlZW4gIlJlc3VtbyIgdGFiKQogICAgICBpZiAoc2VjdGlvblNjb3Jlcy5sZW5ndGggPiAwKSB7CiAgICAgICAgaHRtbCArPSBgPGgyPuCfg4ogQ2F0ZWdvcnkgSGVhbHRoIFNjb3JlczwvaDI+PGRpdiBjbGFzcz0iaGVhbHRoLXNjb3JlcyI+YDsKICAgICAgICBzZWN0aW9uU2NvcmVzLmZvckVhY2gocyA9PiB7CiAgICAgICAgICBjb25zdCBoZWFsdGggPSBzLmhlYWx0aCB8fCB7IGF2ZzogMCwgaGVhbHRoOiAwLCByaXNrOiAiTi9BIiwgY29sb3I6ICIjODg4IiB9OwogICAgICAgICAgY29uc3QgcGN0ID0gcy5hdmcgIT09IG51bGwgPyBzLmF2ZyA6IDA7CiAgICAgICAgICBjb25zdCBmaWxsID0gTWF0aC5taW4ocGN0LCAxMDApOwogICAgICAgICAgY29uc3QgcmVzdCA9IDEwMCAtIGZpbGw7CiAgICAgICAgICBjb25zdCBsYWJlbCA9IHMubmFtZSB8fCBzLnRpdGxlIHx8ICJTZcOnw6NvIjsKICAgICAgICAgIGNvbnN0IHZhbFR4dCA9IHZzLmF2ZyAhPT0gbnVsbCA/IGAke3MuYXZnfSUgKCR7aGVhbHRoLnJpc2t9KWAgOiAiTi9BIjsKICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9ImhlYWx0aC1yb3ciPmAgKwogICAgICAgICAgICBgPHRhYmxlIGNlbGxzcGFjaW5nPSIwIiBjZWxscGFkZGluZz0iMCIgc3R5bGU9IndpZHRoOjEwMCU7IGJvcmRlcjpub25lOyBib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7IG1hcmdpbi1ib3R0b206M3B4OyI+PHRyPmAgKwogICAgICAgICAgICBgPHRkIHN0eWxlPSJmb250LXNpemU6MTFwdDsgY29sb3I6IzQ0NDsgdGV4dC1hbGlnbjpsZWZ0OyI+JHtsYWJlbH08L3RkPmAgKwogICAgICAgICAgICBgPHRkIHN0eWxlPSJmb250LXNpemU6MTFwdDsgZm9udC13ZWlnaHQ6Ym9sZDsgY29sb3I6JHtoZWFsdGguY29sb3J9OyB0ZXh0LWFsaWduOnJpZ2h0OyI+JHt2YWxUeHR9PC90ZD5gICsKICAgICAgICAgICAgYDwvdHI+PC90YWJsZT5gICsKICAgICAgICAgICAgYDx0YWJsZSBjZWxsc3BhY2luZz0iMCIgY2VsbHBhZGRpbmc9IjAiIHN0eWxlPSJ3aWR0aDoxMDAlOyBoZWlnaHQ6OHB4OyBib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7Ij48dHI+YCArCiAgICAgICAgICAgIGA8dGQgc3R5bGU9IndpZHRoOiR7ZmlsbH0lOyBiYWNrZ3JvdW5kOiR7aGVhbHRoLmNvbG9yfTsgZm9udC1zaXplOjFweDsgbGluZS1oZWlnaHQ6OHB4OyBoZWlnaHQ6OHB4OyI+Jm5ic3A7PC90ZD5gICsKICAgICAgICAgICAgYDx0ZCBzdHlsZT0id2lkdGg6JHtyZXN0fSU7IGJhY2tncm91bmQ6I0U1RTdFQjsgZm9udC1zaXplOjFweDsgbGluZS1oZWlnaHQ6OHB4OyBoZWlnaHQ6OHB4OyI+Jm5ic3A7PC90ZD5gICsKICAgICAgICAgICAgYDwvdHI+PC90YWJsZT5gICsKICAgICAgICAgICAgYDwvZGl2PmA7CiAgICAgICAgfSk7CiAgICAgICAgaHRtbCArPSBgPC9kaXY+YDsKICAgICAgfQoKICAgICAgVEVNUExBVEVfU0VDVElPTlMuZm9yRWFjaChzZWN0aW9uID0+IHsKICAgICAgICBjb25zdCBzZWNEYXRhID0gaW5zcGVjdGlvbi5zZWN0aW9ucz8uZmluZChzID0+IHMuaWQgPT09IHNlY3Rpb24uaWQpOwogICAgICAgIGh0bWwgKz0gYDxoMj4ke3NlY3Rpb24ubmFtZSB8fCBzZWN0aW9uLnRpdGxlIHx8ICJTZcOfw6NvIn08L2gyPmA7CiAgICAgICAgaWYgKHNlY0RhdGE/Lm9ic2VydmF0aW9uKSBodG1sICs9IGA8ZGl2IGNsYXNzPSJvYnMiPjxzdHJvbmc+T2JzZXJ2YcOnw6NvOjwvc3Ryb25nPiAke3NlY0RhdGEub2JzZXJ2YXRpb259PC9kaXY+YDsKICAgICAgICBjb25zdCBzSXRlbXMgPSBpbnNwZWN0aW9uLml0ZW1zPy5maWx0ZXIoaSA9PiBpLnNlY3Rpb25faWQgPT09IHNlY3Rpb24uaWQpIHx8IFtdOwogICAgICAgIHNJdGVtcy5mb3JFYWNoKGl0ZW0gPT4gewogICAgICAgICAgY29uc3QgY29sb3JzID0gWyIjQTMyRDJEIiwgIiM5OTNDMUQiLCAiI0JBNzUxNyIsICIjM0I2RDExIiwgIiMwRjZFNTYiXTsKICAgICAgICAgIGNvbnN0IHNjb3JlQmcgPSBpdGVtLnNjb3JlICE9PSBudWxsID8gY29sb3JzW2l0ZW0uc2NvcmUgLSAxXSA6ICIjODg4IjsKICAgICAgICAgIGNvbnN0IHNjb3JlVHh0ID0gaXRlbS5zY29yZSAhPT0gbnVsbCA/IGl0ZW0uc2NvcmUgOiAiTi9BIjsKICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9Iml0ZW0iPjxzdHJvbmc+JHtpdGVtLmxhYmVsIHx8IGl0ZW0udGV4dCB8fCAiSXRlbSJ9PC9zdHJvbmc+IDxzcGFuIGNsYXNzPSJzY29yZSIgc3R5bGU9ImJhY2tncm91bmQ6JHtzY29yZUJnfSI+JHtzY29yZVR4dH0vNTwvc3Bhbj5gOwogICAgICAgICAgaWYgKGl0ZW0uY29tbWVudCkgaHRtbCArPSBgPGRpdiBjbGFzcz0iY210Ij7ihpIgJHtpdGVtLmNvbW1lbnR9PC9kaXY+YDsKICAgICAgICAgIGlmIChpdGVtLnFjX2NvbW1lbnQpIGh0bWwgKz0gYDxkaXYgY2xhc3M9InFjIj7imqAgUUM6ICR7aXRlbS5xY19jb21tZW50fTwvZGl2PmA7CiAgICAgICAgICBodG1sICs9IGA8L2Rpdj5gOwogICAgICAgIH0pOwoKICAgICAgICAvLyBBZGljaW9uYXIgZm90b3Mgbm8gV29yZAogICAgICAgIC8vIENsaWVudGU6IG9taXRlIGZvdG9zIGRhcyBjYXRlZ29yaWFzIGRlIHBlc3NvYWwvc3RhZmYgKGV4LjogUEVTU09BTCBERSBMSU1QRVpBUykKICAgICAgICBjb25zdCBzZWNOYW1lVSA9IChzZWN0aW9uLm5hbWUgfHwgc2VjdGlvbi50aXRsZSB8fCAiIikudG9VcHBlckNhc2UoKTsKICAgICAgICBjb25zdCBpc1N0YWZmQ2F0ID0gKHNlY3Rpb24uaWQgJiYgKHNlY3Rpb24uaWQuaW5jbHVkZXMoInBlc3NvYWwiKSB8fCBzZWN0aW9uLmlkLmluY2x1ZGVzKCJzdGFmZiIpKSkgfHwgc2VjTmFtZVUuaW5jbHVkZXMoIlBFU1NPQUwiKSB8fCBzZWNOYW1lVS5pbmNsdWRlcygiU1RBRkYiKSB8fCBzZWNOYW1lVS5pbmNsdWRlcygiRVFVSVBBIik7CiAgICAgICAgY29uc3QgaW5jbHVkZVBob3RvcyA9IHJlcG9ydFR5cGUgPT09ICJpbnRlcm5hbCIgfHwgIWlzU3RhZmZDYXQ7CiAgICAgICAgaWYgKGluY2x1ZGVQaG90b3MpIHsKICAgICAgICAgIGNvbnN0IHNlY1Bob3RvcyA9IHBob3Rvc0J5SXRlbVtzZWN0aW9uLmlkXSB8fCBbXTsKICAgICAgICAgIGNvbnN0IGl0ZW1QaG90b3MgPSBzSXRlbXMuZmxhdE1hcChpID0+IHBob3Rvc0J5SXRlbVtpLmlkXSB8fCBbXSk7CiAgICAgICAgICBjb25zdCBhbGxQaG90b3MgPSBbLi4uc2VjUGhvdG9zLCAuLi5pdGVtUGhvdG9zXTsKCiAgICAgICAgICBpZiAoYWxsUGhvdG9zLmxlbmd0aCA+IDApIHsKICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz0icGhvdG8tZ3JpZCI+YDsKICAgICAgICAgICAgYWxsUGhvdG9zLmZvckVhY2gocGhvdG8gPT4gewogICAgICAgICAgICAgIGh0bWwgKz0gYDxpbWcgc3JjPSIke3Bob3RvLnVybH0iIGFsdD0iRXZpZMOqbmNpYSIgLz5gOwogICAgICAgICAgICB9KTsKICAgICAgICAgICAgaHRtbCArPSBgPC9kaXY+YDsKICAgICAgICAgIH0KICAgICAgICB9CiAgICAgIH0pOwogICAgICAvLyBTaWduYXR1cmVzCiAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9Im1hcmdpbi10b3A6IDQwcHg7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsiPmA7CiAgICAgIGlmIChpbnNwZWN0aW9uLmluc3BlY3Rvcl9zaWcpIGh0bWwgKz0gYDxkaXY+PGltZyBzcmM9IiR7aW5zcGVjdGlvbi5pbnNwZWN0b3Jfc2lnfSIgc3R5bGU9IndpZHRoOiAxNTBweDsgaGVpZ2h0OiA1MHB4OyIgLz48YnIvPjxzdHJvbmc+SW5zcGVjdG9yIFNpZ25hdHVyZTwvc3Ryb25nPjwvZGl2PmA7CiAgICAgIGlmIChpbnNwZWN0aW9uLmNsaWVudF9zaWcpIGh0bWwgKz0gYDxkaXY+PGltZyBzcmM9IiR7aW5zcGVjdGlvbi5jbGllbnRfc2lnfSIgc3R5bGU9IndpZHRoOiAxNTBweDsgaGVpZ2h0OiA1MHB4OyIgLz48YnIvPjxzdHJvbmc+Q2xpZW50IFNpZ25hdHVyZTwvc3Ryb25nPjwvZGl2PmA7CiAgICAgIGh0bWwgKz0gYDwvZGl2PmA7CiAgICAgIGh0bWwgKz0gYDwvYm9keT48L2h0bWw+YDsKCiAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbJ1x1ZmVmZicsIGh0bWxdLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9tc3dvcmQnIH0pOwogICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOwogICAgICBjb25zdCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOwogICAgICBsaW5rLmhyZWYgPSB1cmw7CiAgICAgIGNvbnN0IHR5cGVMYWJlbCA9IHJlcG9ydFR5cGUgPT09ICJjbGllbnQiID8gIkNsaWVudGUiIDogIkludGVybm8iOwogICAgICBsaW5rLmRvd25sb2FkID0gYFJlbGF0b3Jpby0ke3R5cGVMYWJlbH0tJHtpbnNwZWN0aW9uLmxvY2F0aW9uX25hbWUgfHwgIkluc3BlY2FvIn0uZG9jYDsKICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaW5rKTsKICAgICAgbGluay5jbGljaygpOwogICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGxpbmspOwogICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCJFcnJvIGFvIGdlcmFyIFdvcmQ6IiwgZXJyb3IpOwogICAgICBhbGVydCgiRXJybyBhbyBnZXJhciBXb3JkLiBUZW50ZSBub3ZhbWVudGUuIik7CiAgICB9CiAgfTsK';
const newFn = Buffer.from(B64, 'base64').toString('utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n+$/, '');

const raw = fs.readFileSync(FILE, 'utf8');
const hadCRLF = raw.includes('\r\n');
let src = raw.replace(/\r\n/g, '\n');

if (src.includes('handleDownloadWord = (reportType = "internal")')) {
  console.log('Already applied — new function signature found. Nothing to do.');
  process.exit(0);
}

const START = '  const handleDownloadWord = () => {';
const END   = '  // Se não houver dados, mostrar loading';
const i1 = src.indexOf(START);
const i2 = src.indexOf(END);
if (i1 < 0) { console.error('FAIL: START marker not found. The file may have changed.'); process.exit(1); }
if (i2 < 0) { console.error('FAIL: END marker not found.'); process.exit(1); }
if (i2 <= i1) { console.error('FAIL: markers in unexpected order.'); process.exit(1); }

const before = src.slice(0, i1);
const after  = src.slice(i2);
let result = before + newFn + '\n' + after;
console.log('1/2: Replaced handleDownloadWord function (' + (i2 - i1) + ' -> ' + newFn.length + ' chars).');

const OLD_BTN =
`          <button className="btn btn-primary btn-sm" onClick={handleDownloadWord}>
            <Icon name="file" size={13} /> Word
          </button>`;
const NEW_BTN =
`          <button className="btn btn-primary btn-sm" onClick={() => handleDownloadWord("client")} title="Relatório para o Cliente (omite fotos de pessoal/staff)">
            <Icon name="file" size={13} /> Word (Cliente)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadWord("internal")} title="Relatório Interno (completo, com todas as fotos)">
            <Icon name="file" size={13} /> Word (Interno)
          </button>`;
if (!result.includes(OLD_BTN)) { console.error('FAIL: original "Word" button block not found.'); process.exit(1); }
result = result.replace(OLD_BTN, NEW_BTN);
console.log('2/2: Replaced Word button (1 -> 2 buttons).');

const out = hadCRLF ? result.replace(/\n/g, '\r\n') : result;
fs.writeFileSync(FILE, out);
console.log('OK: wrote ' + FILE + ' (line endings: ' + (hadCRLF ? 'CRLF' : 'LF') + ').');
console.log('Next: npm run dev, open an inspection, click Word (Cliente) or Word (Interno).');
