// Dependency-free PDF export: wrap a composited JPEG in a minimal one-page PDF — a DCTDecode image
// XObject placed to fill a MediaBox sized in CSS px (so the embedded device-res JPEG renders at high
// DPI). Byte offsets are tracked as the body is assembled, for the xref table.

export const bytesOf = (binary: string): Uint8Array => {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

export const buildImagePdf = (
  jpeg: Uint8Array,
  pxWidth: number,
  pxHeight: number,
  ptWidth: number,
  ptHeight: number,
): Blob => {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const pushBytes = (bytes: Uint8Array): void => {
    parts.push(bytes);
    len += bytes.length;
  };
  const pushText = (text: string): void => pushBytes(enc.encode(text));
  const startObject = (header: string): void => {
    offsets.push(len);
    pushText(header);
  };

  pushText("%PDF-1.4\n");
  startObject("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  startObject(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth} ${ptHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  startObject(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxWidth} /Height ${pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  pushBytes(jpeg);
  pushText("\nendstream\nendobj\n");
  const content = `q ${ptWidth} 0 0 ${ptHeight} 0 0 cm /Im0 Do Q`;
  startObject(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefAt = len;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  pushText(xref);

  const pdf = new Uint8Array(len);
  let at = 0;
  for (const part of parts) {
    pdf.set(part, at);
    at += part.length;
  }
  return new Blob([pdf], { type: "application/pdf" });
};
