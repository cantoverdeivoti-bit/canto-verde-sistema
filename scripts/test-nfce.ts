/**
 * A leitura da nota do mercado (`lib/nfce.ts`) contra uma página no layout
 * do portal da NFC-e (o da SVRS, que atende o RS). Sem banco e sem rede.
 *
 *   npx tsx scripts/test-nfce.ts
 */
import { linkDaNota, lerPaginaDaNota, quadroDaNota } from "@/lib/nfce";

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`ok   ${nome}`);
  else {
    falhas++;
    console.log(`FALHA ${nome}`, detalhe ?? "");
  }
}

const CHAVE = "43261012345678000195650010000123451123456789";

// O link do QR
const l = linkDaNota(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${CHAVE}|2|1|1|ABCDEF0123`);
confere("link do RS aceito", l?.chave === CHAVE, l);
confere("link fora do governo recusado", linkDaNota(`https://exemplo.com/?p=${CHAVE}|2|1`) === null);
confere("texto que não é link recusado", linkDaNota("oi") === null);
confere("link sem chave recusado", linkDaNota("https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=123") === null);

// O quadro (iframe) que embrulha a página
confere(
  "iframe do governo seguido",
  quadroDaNota(`<iframe id="iframeConteudo" src="https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=${CHAVE}|2|1&amp;x=1"></iframe>`) ===
    `https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=${CHAVE}|2|1&x=1`,
);
confere("iframe de fora recusado", quadroDaNota(`<iframe src="https://exemplo.com/x"></iframe>`) === null);

// A página
const HTML = `
<div id="conteudo">
  <div class="txtCenter">
    <div id="u20" class="txtTopo">SUPERMERCADO EXEMPLO LTDA</div>
    <div class="text">CNPJ: 12.345.678/0001-95</div>
    <div class="text">RUA DAS FLORES, 100, CENTRO, IVOTI, RS</div>
  </div>
  <table id="tabResult" width="100%">
    <tr id="Item + 1">
      <td valign="top"><span class="txtTit">ALHO TRIT POTE 1KG</span><span class="RCod">(Código: 7891234567890 )</span><br />
        <span class="Rqtd"><strong>Qtde.:</strong>2</span><span class="RUN"><strong>UN: </strong>UN</span>
        <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;12,99</span></td>
      <td align="right" valign="top" class="txtTit noWrap">Vl. Total<br /><span class="valor">25,98</span></td>
    </tr>
    <tr id="Item + 2">
      <td valign="top"><span class="txtTit">BANANA CATURRA</span><span class="RCod">(Código: 0 )</span><br />
        <span class="Rqtd"><strong>Qtde.:</strong>1,235</span><span class="RUN"><strong>UN: </strong>KG</span>
        <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;5,49</span></td>
      <td align="right" valign="top" class="txtTit noWrap">Vl. Total<br /><span class="valor">6,78</span></td>
    </tr>
    <tr id="Item + 3">
      <td valign="top"><span class="txtTit">SACOLA PLAST &amp; CIA</span><span class="RCod">(Código: 99 )</span><br />
        <span class="Rqtd"><strong>Qtde.:</strong>1</span><span class="RUN"><strong>UN: </strong>UN</span>
        <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;0,15</span></td>
      <td align="right" valign="top" class="txtTit noWrap">Vl. Total<br /><span class="valor">0,15</span></td>
    </tr>
  </table>
  <div id="totalNota" class="txtRight">
    <div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">3</span></div>
    <div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">32,91</span></div>
  </div>
  <div id="infos"><ul><li><strong>Número: </strong>12345 <strong>Série: </strong>1 <strong>Emissão: </strong>06/10/2026 14:20:31 - Via Consumidor</li></ul></div>
</div>`;

const nota = lerPaginaDaNota(HTML, CHAVE);
confere("página lida", nota !== null);
if (nota) {
  confere("emitente", nota.emitente.nome === "SUPERMERCADO EXEMPLO LTDA" && nota.emitente.cnpj === "12345678000195", nota.emitente);
  confere("três itens", nota.itens.length === 3, nota.itens.length);
  const [a, b, c] = nota.itens;
  confere("item 1", a.descricao === "ALHO TRIT POTE 1KG" && a.codigo === "7891234567890" && a.quantidade === 2 && a.unidade === "UN" && a.valorUnitario === 12.99 && a.valorTotal === 25.98, a);
  confere("item 2 em KG, sem código", b.codigo === null && b.quantidade === 1.235 && b.unidade === "KG" && b.valorTotal === 6.78, b);
  confere("item 3 com entidade", c.descricao === "SACOLA PLAST & CIA", c.descricao);
  confere("total", nota.total === 32.91, nota.total);
  confere("emissão", nota.emissao === "06/10/2026 14:20", nota.emissao);
}
confere("página sem itens dá nulo", lerPaginaDaNota("<html><body>Erro</body></html>", CHAVE) === null);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
