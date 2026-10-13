import { Folha, paraHelvetica } from "./folha";

/** A data do banco (só dia, em UTC) como "aaaa-mm-dd", sem passar pelo `lib/availability`, que abre o banco. */
const dia = (d: Date) => d.toISOString().slice(0, 10);

const dataBR = (d: Date) => {
  const s = dia(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};

type Pessoa = {
  nome: string;
  /** Já formatado, ou nulo quando quem pede não pode ver o CPF. */
  cpf: string | null;
  inicio: Date | null;
  funcao: string | null;
  entregas: { data: Date; quantidade: number; tamanho: string | null; item: { nome: string; ca: string | null } }[];
};

/**
 * A ficha de entrega de EPI e uniforme em PDF, para assinar, como
 * `/imprimir/pessoal/epi/[id]`: todas as entregas, com o CA de cada EPI, a
 * declaração de responsabilidade e linhas em branco para as próximas.
 */
export async function termoDeEpiEmPdf(c: Pessoa): Promise<Buffer> {
  const folha = new Folha({ titulo: `Ficha de EPI ${c.nome}`, margem: 34 });
  const doc = folha.doc;
  folha.nome = `Ficha de entrega de EPI · ${c.nome}`;
  folha.texto("Ficha de entrega de EPI e uniforme", { tamanho: 16, negrito: true });
  folha.y += 6;
  folha.linha({ cor: "#a3a3a3" });
  folha.y += 6;

  const metade = folha.largura / 2;
  const dados: [string, string][] = [
    ["Nome", c.nome],
    ["Função", c.funcao ?? "________________"],
    ["CPF", c.cpf ?? "________________"],
    ["Admissão", c.inicio ? dataBR(c.inicio) : "___/___/______"],
  ];
  for (let i = 0; i < dados.length; i += 2) {
    const linha = folha.y;
    let fim = linha;
    dados.slice(i, i + 2).forEach(([rotulo, valor], j) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#000000")
        .text(`${rotulo}: `, folha.x + j * (metade + 10), linha, { width: metade - 10, continued: true })
        .font("Helvetica")
        .text(paraHelvetica(valor));
      fim = Math.max(fim, doc.y);
    });
    folha.y = fim + 3;
  }
  folha.y += 3;
  folha.linha({ cor: "#a3a3a3" });
  folha.y += 8;

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(
      paraHelvetica(
        "Declaro que recebi, gratuitamente, os equipamentos de proteção individual e as peças de uniforme abaixo, e me comprometo a: usá-los apenas para a finalidade a que se destinam; responsabilizar-me pela guarda e conservação; comunicar qualquer alteração que os torne impróprios para uso; e devolvê-los quando substituídos ou ao deixar a empresa.",
      ),
      folha.x,
      folha.y,
      { width: folha.largura, align: "justify" },
    );
  folha.y = doc.y + 10;

  // Linhas em branco para as próximas entregas, escritas à mão.
  const vazias = Math.max(4, 14 - c.entregas.length);
  folha.tabela(
    [
      { titulo: "Data", peso: 22 },
      { titulo: "Item", peso: 62 },
      { titulo: "CA", peso: 20 },
      { titulo: "Qtd", peso: 12, direita: true },
      { titulo: "Tam.", peso: 16 },
      { titulo: "Assinatura", peso: 50 },
    ],
    [
      ...c.entregas.map((e) => [dataBR(e.data), e.item.nome, e.item.ca ?? "", String(e.quantidade), e.tamanho ?? "", ""]),
      ...Array.from({ length: vazias }, () => ["", "", "", "", "", ""]),
    ],
    { tamanho: 9.5, alturaMinima: 22 },
  );

  folha.assinaturas(["Assinatura do colaborador", "Responsável pela entrega"]);
  return folha.terminar();
}
