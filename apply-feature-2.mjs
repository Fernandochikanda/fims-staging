#!/usr/bin/env node
import fs from 'fs';
const FILE = 'src/pages/InspectionDetail.jsx';
const LIST_FILE = 'src/pages/InspectionsList.jsx';
const newPdf = fs.readFileSync('new-pdf-fn.txt', 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const newWord = fs.readFileSync('new-word-fn.txt', 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');

const raw = fs.readFileSync(FILE, 'utf8');
const hadCRLF = raw.includes('\r\n');
let src = raw.replace(/\r\n/g, '\n');

if (src.includes('handleDownloadPDF = async (reportType = "internal")')) {
  console.log('InspectionDetail.jsx: already applied. Skipping.');
} else {
  const PDF_START = '  const handleDownloadPDF = async () => {';
  const WORD_START = '  const handleDownloadWord = () => {';
  const p1 = src.indexOf(PDF_START);
  const p2 = src.indexOf(WORD_START);
  if (p1 < 0) { console.error('FAIL: PDF marker not found'); process.exit(1); }
  if (p2 < 0) { console.error('FAIL: Word marker not found'); process.exit(1); }
  if (p2 <= p1) { console.error('FAIL: markers order'); process.exit(1); }
  src = src.slice(0, p1) + newPdf + '\n' + src.slice(p2);
  console.log('1/4: Replaced handleDownloadPDF (' + (p2 - p1) + ' -> ' + newPdf.length + ' chars).');

  const W_START = '  const handleDownloadWord = () => {';
  const W_END = '  // Se não houver dados, mostrar loading';
  const w1 = src.indexOf(W_START);
  const w2 = src.indexOf(W_END);
  if (w1 < 0) { console.error('FAIL: Word start not found'); process.exit(1); }
  if (w2 < 0) { console.error('FAIL: Word end not found'); process.exit(1); }
  if (w2 <= w1) { console.error('FAIL: Word markers order'); process.exit(1); }
  src = src.slice(0, w1) + newWord + '\n' + src.slice(w2);
  console.log('2/4: Replaced handleDownloadWord (' + (w2 - w1) + ' -> ' + newWord.length + ' chars).');

  const OLD_BTN =
`        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-danger btn-sm" onClick={handleDownloadPDF}>
            <Icon name="download" size={13} /> PDF
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleDownloadWord}>
            <Icon name="file" size={13} /> Word
          </button>
          {inspection.status === "reviewed" && (
            <button className="btn btn-secondary btn-sm" onClick={() => onUpdate({ ...inspection, status: "sent_to_client" })}>
              <Icon name="send" size={13} /> Enviar ao Cliente
            </button>
          )}
        </div>`;
  const NEW_BTN =
`        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-danger btn-sm" onClick={() => handleDownloadPDF("client")} title="Relatório PDF para o Cliente (omite fotos de pessoal/staff)">
            <Icon name="download" size={13} /> PDF (Cliente)
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handleDownloadPDF("internal")} title="Relatório PDF Interno (completo)">
            <Icon name="download" size={13} /> PDF (Interno)
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleDownloadWord("client")} title="Relatório Word para o Cliente (omite fotos de pessoal/staff)">
            <Icon name="file" size={13} /> Word (Cliente)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadWord("internal")} title="Relatório Word Interno (completo)">
            <Icon name="file" size={13} /> Word (Interno)
          </button>
        </div>`;
  if (!src.includes(OLD_BTN)) { console.error('FAIL: button block not found. Revert first: git checkout -- src/pages/InspectionDetail.jsx'); process.exit(1); }
  src = src.replace(OLD_BTN, NEW_BTN);
  console.log('3/4: Replaced export buttons -> 4 buttons.');

  const out = hadCRLF ? src.replace(/\n/g, '\r\n') : src;
  fs.writeFileSync(FILE, out);
  console.log('OK: wrote ' + FILE + ' (' + (hadCRLF ? 'CRLF' : 'LF') + ').');
}

const rawL = fs.readFileSync(LIST_FILE, 'utf8');
const hadCRLF_L = rawL.includes('\r\n');
let srcL = rawL.replace(/\r\n/g, '\n');
const OPT_LINE = '            <option value="sent_to_client">Enviada ao Cliente</option>\n';
if (srcL.includes(OPT_LINE)) {
  srcL = srcL.replace(OPT_LINE, '');
  const outL = hadCRLF_L ? srcL.replace(/\n/g, '\r\n') : srcL;
  fs.writeFileSync(LIST_FILE, outL);
  console.log('4/4: Removed "sent_to_client" option from ' + LIST_FILE + '.');
} else {
  console.log('4/4: sent_to_client already absent.');
}
console.log('Done.');
