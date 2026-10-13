/**
 * A foto da ficha num formato que o pdfkit lê. O upload aceita JPG, PNG e
 * WEBP, e o pdfkit só lê JPEG e PNG: o `sharp` reduz a foto para no máximo
 * 800 px (nítida nos 4 cm da folha, e leve) e salva em JPEG. Se o `sharp`
 * falhar, vale a original quando for JPEG ou PNG, depois a miniatura (JPEG
 * quadrado de 240 px), e por fim nada: a ficha sai sem foto, nunca com erro.
 */
export async function fotoParaPdf(dados: Uint8Array | null, mime: string, miniatura: Uint8Array | null): Promise<Buffer | null> {
  if (dados && dados.length > 0) {
    try {
      const { default: sharp } = await import("sharp");
      return await sharp(dados).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    } catch {
      if (mime === "image/jpeg" || mime === "image/png") return Buffer.from(dados);
    }
  }
  return miniatura && miniatura.length > 0 ? Buffer.from(miniatura) : null;
}
