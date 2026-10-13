import { termoDeEpiEmPdf } from "../lib/pdf/epi-pdf";
import { Folha, paraHelvetica } from "../lib/pdf/folha";
import { fotoParaPdf } from "../lib/pdf/foto";
import { processoEmPdf } from "../lib/pdf/processo-pdf";
import { producaoDoEventoEmPdf } from "../lib/pdf/producao-evento-pdf";
import { nomeDoPdf, pdfDe } from "../lib/pdf-da-pagina";

/** As folhas em PDF, sem banco: o texto que a Helvetica aceita, o nome do arquivo e folhas geradas com dados de exemplo. */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`ERRO ${nome}\n     obtido:   ${a}\n     esperado: ${b}`);
  }
}
/** Quantas páginas o PDF tem: cada uma é um objeto "/Type /Page". */
const paginas = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
const ehPdf = (pdf: Buffer) => pdf.subarray(0, 5).toString() === "%PDF-";

async function main() {
  igual("aspas e travessão do celular", paraHelvetica("“Forno” — 70 °C"), '"Forno" - 70 °C');
  igual("emoji sai", paraHelvetica("Urgente 🔥"), "Urgente");
  igual("seta vira ->", paraHelvetica("200 → 180 °C"), "200 -> 180 °C");
  igual("acento fica", paraHelvetica("Açúcar, Pão"), "Açúcar, Pão");
  igual("nulo vira vazio", paraHelvetica(null), "");

  igual("endereço do PDF", pdfDe("/imprimir/receituario/425B?tipo=tecnica"), "/pdf/receituario/425B?tipo=tecnica");
  igual("nome da ficha técnica", nomeDoPdf(["receituario", "425B"], new URLSearchParams("tipo=tecnica")), "receituario-425b-tecnica.pdf");
  igual("nome com a categoria", nomeDoPdf(["receituario"], new URLSearchParams("categoria=Prato Principal")), "receituario-prato-principal.pdf");
  igual("nome da escala com a semana", nomeDoPdf(["escala"], new URLSearchParams("semana=2026-10-12")), "escala-2026-10-12.pdf");

  const curto = await processoEmPdf({ titulo: "Abrir a cozinha", objetivo: "Deixar tudo pronto às 10h.", passos: ["Ligar o gás", "Ligar o forno"], observacoes: null, revisadoEm: null, obrigatorio: [] });
  igual("processo curto: PDF de uma página", [ehPdf(curto), paginas(curto)], [true, 1]);
  const longo = await processoEmPdf({
    titulo: "Fechar a cozinha",
    objetivo: null,
    passos: Array.from({ length: 80 }, (_, i) => `Passo ${i + 1}: conferir, limpar e anotar no caderno antes de sair.`),
    observacoes: "Sem pressa.",
    revisadoEm: new Date("2026-10-01T00:00:00Z"),
    obrigatorio: [{ funcao: { nome: "Cozinheira" } }],
  });
  igual("processo longo continua na página seguinte", paginas(longo) > 1, true);

  const termo = await termoDeEpiEmPdf({
    nome: "Fulana de Tal",
    cpf: null,
    inicio: null,
    funcao: "Cozinheira",
    entregas: [{ data: new Date("2026-10-10T00:00:00Z"), quantidade: 1, tamanho: "40", item: { nome: "Bota antiderrapante", ca: "12345" } }],
  });
  igual("termo de EPI numa página", [ehPdf(termo), paginas(termo)], [true, 1]);

  const semCardapio = await producaoDoEventoEmPdf("Aniversário", "09/11/2026 · 40 convidados", null);
  igual("produção sem cardápio ainda sai", [ehPdf(semCardapio), paginas(semCardapio)], [true, 1]);

  // A foto da ficha: o upload aceita WEBP, e o PDF só lê JPEG e PNG.
  const { default: sharp } = await import("sharp");
  const webp = new Uint8Array(await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c84" } }).webp().toBuffer());
  const jpeg = await fotoParaPdf(webp, "image/webp", null);
  const ehJpeg = (b: Buffer | null) => b !== null && b[0] === 0xff && b[1] === 0xd8;
  igual("foto WEBP vira JPEG", ehJpeg(jpeg), true);
  igual("foto grande é reduzida a 800 px", jpeg ? (await sharp(jpeg).metadata()).width : null, 800);
  const miniatura = new Uint8Array(await sharp({ create: { width: 240, height: 240, channels: 3, background: "#888" } }).jpeg().toBuffer());
  igual("foto ilegível cai na miniatura", ehJpeg(await fotoParaPdf(new Uint8Array([1, 2, 3]), "image/webp", miniatura)), true);
  igual("sem foto nenhuma, nada", await fotoParaPdf(null, "image/webp", null), null);
  const comFoto = new Folha({ titulo: "Foto" });
  comFoto.doc.image(jpeg!, 40, 40, { cover: [113, 85] });
  const pdfComFoto = await comFoto.terminar();
  igual("a foto entra no PDF", pdfComFoto.toString("latin1").includes("/Subtype /Image"), true);

  if (falhas > 0) {
    console.log(`\n${falhas} falha(s).`);
    process.exit(1);
  }
  console.log("\nTudo certo.");
}
main();
