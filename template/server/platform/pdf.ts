// Mohit platform: simple PDF documents (invoices, receipts, certificates, reports). Do not edit.
//   import { createPdf } from "./platform/pdf.ts";
//   const doc = createPdf();                       // A4 portrait; coordinates in points, origin bottom-left
//   doc.text("Invoice #12", 40, 800, { size: 18, bold: true });
//   doc.table(40, 700, [{ label: "Item", width: 300 }, { label: "Amount", width: 120, align: "right" }], rows);
//   res.setHeader("Content-Type", "application/pdf").send(doc.toBuffer());
// Fonts: Helvetica / Helvetica-Bold (Latin text; other characters become "?").

export interface TextOpts { size?: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "right" | "center"; maxWidth?: number }
export interface Column { label: string; width: number; align?: "left" | "right" }

const W = 595, H = 842; // A4

function esc(s: string): string {
  return s.replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

/** Approximate Helvetica width in points (good enough for alignment and wrapping). */
export function textWidth(s: string, size = 10, bold = false): number {
  let w = 0;
  for (const ch of s) {
    w += /[il|.,:;'!]/.test(ch) ? 260 : /[ fjrt]/.test(ch) ? 300 : /[mwMW]/.test(ch) ? 860 : /[A-Z0-9$#%&@]/.test(ch) ? 640 : 540;
  }
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

export function createPdf() {
  const pages: string[][] = [[]];
  const cur = () => pages[pages.length - 1];
  const rgb = (c: [number, number, number]) => c.map((v) => (v / 255).toFixed(3)).join(" ");

  const doc = {
    width: W,
    height: H,
    /** Start a new page; later drawing goes there. */
    addPage() { pages.push([]); return doc; },
    get pageCount() { return pages.length; },
    text(s: string, x: number, y: number, o: TextOpts = {}) {
      const size = o.size ?? 10;
      let str = String(s);
      if (o.maxWidth) while (str.length > 1 && textWidth(str, size, o.bold) > o.maxWidth) str = str.slice(0, -2) + "…";
      const w = textWidth(str, size, o.bold);
      const tx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
      cur().push(`${rgb(o.color ?? [17, 24, 39])} rg BT /${o.bold ? "F2" : "F1"} ${size} Tf ${tx.toFixed(1)} ${y.toFixed(1)} Td (${esc(str)}) Tj ET`);
      return doc;
    },
    /** Wrapped paragraph; returns the y below the last line. */
    paragraph(s: string, x: number, y: number, width: number, o: TextOpts = {}): number {
      const size = o.size ?? 10, lead = size * 1.4;
      let line = "";
      for (const word of String(s).split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (textWidth(next, size, o.bold) > width && line) { doc.text(line, x, y, o); y -= lead; line = word; }
        else line = next;
      }
      if (line) { doc.text(line, x, y, o); y -= lead; }
      return y;
    },
    line(x1: number, y1: number, x2: number, y2: number, color: [number, number, number] = [226, 232, 240], width = 0.75) {
      cur().push(`${rgb(color)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
      return doc;
    },
    rect(x: number, y: number, w: number, h: number, fill: [number, number, number]) {
      cur().push(`${rgb(fill)} rg ${x} ${y} ${w} ${h} re f`);
      return doc;
    },
    /**
     * A table with a header row; continues on new pages when it reaches the bottom margin.
     * Returns the y below the table (on the last page).
     */
    table(x: number, y: number, columns: Column[], rows: (string | number)[][], o: { size?: number; rowHeight?: number; bottom?: number; headerFill?: [number, number, number] } = {}): number {
      const size = o.size ?? 10, rh = o.rowHeight ?? 22, bottom = o.bottom ?? 60;
      const total = columns.reduce((s, c) => s + c.width, 0);
      const header = () => {
        doc.rect(x, y - 7, total, rh, o.headerFill ?? [241, 245, 249]);
        let cx = x;
        for (const c of columns) {
          doc.text(c.label, c.align === "right" ? cx + c.width - 8 : cx + 8, y, { size: size - 1, bold: true, color: [71, 85, 105], align: c.align === "right" ? "right" : "left", maxWidth: c.width - 12 });
          cx += c.width;
        }
        y -= rh;
      };
      header();
      for (const row of rows) {
        if (y < bottom) { doc.addPage(); y = H - 60; header(); }
        let cx = x;
        columns.forEach((c, i) => {
          doc.text(String(row[i] ?? ""), c.align === "right" ? cx + c.width - 8 : cx + 8, y, { size, align: c.align === "right" ? "right" : "left", maxWidth: c.width - 12 });
          cx += c.width;
        });
        doc.line(x, y - 8, x + total, y - 8);
        y -= rh;
      }
      return y;
    },
    toBuffer(): Buffer {
      const objs: string[] = [];
      const add = (o: string) => (objs.push(o), objs.length);
      const catalog = add("");
      const pagesObj = add("");
      const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
      const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
      const kids: number[] = [];
      for (const ops of pages) {
        const content = ops.join("\n");
        const c = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
        kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${c} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`));
      }
      objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
      objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
      let out = "%PDF-1.4\n";
      const offsets: number[] = [];
      objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = Buffer.byteLength(out, "latin1");
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
      out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Buffer.from(out, "latin1");
    },
  };
  return doc;
}
