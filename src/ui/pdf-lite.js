// Generador de PDF minimo (texto) sin dependencias para la "Ficha" de la Guia
// Docente. Fuentes estandar Helvetica / Helvetica-Bold con WinAnsiEncoding
// (cubre tildes, n, ¿ ¡ del espanol). Pagina A4, ajuste de lineas aproximado y
// salto de pagina automatico. Funcion pura: devuelve Uint8Array.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;

// Caracteres fuera de Latin-1 que WinAnsi si tiene (o se sustituyen).
const WINANSI = { '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80 };
const REPLACE = { '₂': '2', '✓': '-', '✦': '*', '〰': '~', '♥': '<3', '▲': '+', '·': '·' };

export function toWinAnsi(text) {
  const bytes = [];
  for (const chRaw of String(text)) {
    const ch = REPLACE[chRaw] ?? chRaw;
    for (const c of ch) {
      if (c in WINANSI) bytes.push(WINANSI[c]);
      else {
        const code = c.codePointAt(0);
        bytes.push(code <= 0xff ? code : 0x3f); // '?' si no existe
      }
    }
  }
  return bytes;
}

function escapeBytes(bytes) {
  let out = '';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return out;
}

/** Ajuste de linea por ancho aproximado (Helvetica ~0.5 em por caracter). */
export function wrapText(text, size, width = PAGE_W - 2 * MARGIN) {
  const maxChars = Math.max(10, Math.floor(width / (size * 0.5)));
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * blocks: [{ text, size?, bold?, gap? }]. Devuelve los bytes del PDF.
 */
export function buildPdf(blocks, { title = 'Documento' } = {}) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = PAGE_H - MARGIN;
  };
  for (const b of blocks) {
    const size = b.size ?? 11;
    const lead = size * 1.35;
    y -= b.gap ?? 0;
    for (const line of wrapText(b.text, size)) {
      if (y - lead < MARGIN) newPage();
      y -= lead;
      ops.push(`BT /${b.bold ? 'F2' : 'F1'} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${escapeBytes(toWinAnsi(line))}) Tj ET`);
    }
  }
  pages.push(ops);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add(null);
  const pagesId = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  for (const p of pages) {
    const stream = p.join('\n');
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`)
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Title (${escapeBytes(toWinAnsi(title))}) /Producer (Misti Sound) >>`);

  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Todos los caracteres ya son bytes 0..255 (escapados en octal si no son ASCII).
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}
