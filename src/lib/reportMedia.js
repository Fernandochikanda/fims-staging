// /src/lib/reportMedia.js
// Utilitários partilhados de media para os relatórios (Word / PDF).
// O Microsoft Word não suporta object-fit, flex nem grid no HTML importado:
// as imagens têm de ir embutidas em base64 e com atributos width/height
// calculados a partir da proporção real — daí estes helpers.

/** Largura/altura naturais de uma imagem (dataURL ou URL). */
export const getImageSize = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Dimensões de exibição que cabem na caixa mantendo a proporção. */
export const fitDims = (w, h, boxW, boxH) => {
  if (!w || !h) return { width: boxW, height: Math.round(boxW * 0.66) };
  const scale = Math.min(boxW / w, boxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

/** Converte uma URL (blob:/remota) em dataURL base64; null se falhar. */
export const fetchMediaDataUrl = async (url) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
};

/**
 * Logotipo oficial comprimido via canvas (JPEG) para Word/PDF.
 * O LOGO.png é RGBA ~93% transparente: sem o fill branco prévio, o JPEG
 * fica com fundo PRETO e o logotipo desaparece. Fundo branco garantido.
 * Devolve { dataUrl, width, height } com a proporção real; null se falhar.
 */
export const fetchLogoAsset = (logoSrc, maxW = 360) =>
  new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        resolve({ dataUrl, width: w, height: h });
      };
      img.onerror = () => resolve(null);
      img.src = logoSrc;
    } catch (e) {
      resolve(null);
    }
  });

/**
 * Foto pronta para HTML-Word: base64 embutido + width/height explícitos
 * que respeitam a proporção original dentro da caixa (boxW × boxH px).
 */
export const fetchFittedPhoto = async (url, boxW, boxH) => {
  const src = await fetchMediaDataUrl(url);
  if (!src) return null;
  const size = await getImageSize(src);
  const { width, height } = fitDims(size?.w, size?.h, boxW, boxH);
  return { src, width, height };
};

/** Cartões KPI Word-safe: <table> real com estilos inline (display:table-cell
 *  em divs não é fiável no Word nem no LibreOffice). */
export const wordKpiTable = (kpis) => {
  const tds = kpis.map(k =>
    `<td width="${Math.round(100 / kpis.length)}%" align="center" style="background:#1E2A3A;border:3px solid #FFFFFF;padding:12px 6px;">` +
    `<div style="font-size:${k.small ? "12" : "17"}pt;font-weight:bold;color:#FAC775;">${k.value}</div>` +
    `<div style="font-size:8pt;color:#C9D2DC;text-transform:uppercase;letter-spacing:1px;">${k.label}</div>` +
    `</td>`).join("");
  return `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0;"><tr>${tds}</tr></table>`;
};

/** Grelha de fotos Word-safe: tabela N por linha com dimensões calculadas. */
export const wordPhotoTable = (photos, { perRow = 3, boxW = 200, boxH = 150, caption = null } = {}) => {
  if (!photos.length) return "";
  const fitted = photos; // já convertidos por fetchFittedPhoto
  let rows = [];
  for (let i = 0; i < fitted.length; i += perRow) {
    const cells = [];
    for (let j = i; j < i + perRow; j++) {
      const p = fitted[j];
      if (p) {
        cells.push(
          `<td width="${Math.round(100 / perRow)}%" align="center" style="padding:5px;">` +
          `<img src="${p.src}" width="${p.width}" height="${p.height}" alt="Evidencia" style="border:1px solid #D5D9DE;" />` +
          (caption && caption[j] ? `<div style="font-size:8pt;color:#6B7280;padding-top:3px;">${caption[j]}</div>` : "") +
          `</td>`
        );
      } else {
        cells.push(`<td width="${Math.round(100 / perRow)}%"></td>`);
      }
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:8px 0;">${rows.join("")}</table>`;
};
