import { decodificarOfx, lerOfx } from "../lib/ofx";

/**
 * O leitor de extrato OFX, sem banco: `npx tsx scripts/test-ofx.ts`.
 */

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

// O formato antigo (SGML), como Sicredi, Banrisul e Itaú exportam: tags de
// valor sem fechamento, charset 1252, FITID repetido em duas tarifas.
const sgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261031120000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0748<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006120000[-3:BRT]<TRNAMT>-450.30<FITID>A1<MEMO>PAGTO CONTA LUZ RGE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261007<TRNAMT>968,10<FITID>A2<NAME>STONE PAGAMENTOS<MEMO>CRED VENDAS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-12.90<FITID>TAR<MEMO>TARIFA MANUTENÇÃO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-12.90<FITID>TAR<MEMO>TARIFA MANUTENÇÃO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261011<TRNAMT>0.00<FITID>Z<MEMO>ZERADO</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1.504,90<DTASOF>20261031</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

// "MANUTENÇÃO" em 1252: o Ç e o Ã são um byte cada.
const bytes = Uint8Array.from([...sgml].map((c) => c.charCodeAt(0) & 0xff));
const e = lerOfx(decodificarOfx(bytes));
igual("conta do banco", e.conta, "12345-6");
igual("período", [e.de, e.ate], ["2026-10-01", "2026-10-31"]);
igual("saldo final com vírgula", [e.saldoFinal, e.saldoEm], [1504.9, "2026-10-31"]);
igual("transação zerada fica de fora", e.transacoes.length, 4);
igual("saída negativa e data", [e.transacoes[0].data, e.transacoes[0].valor], ["2026-10-06", -450.3]);
igual("valor com vírgula decimal", e.transacoes[1].valor, 968.1);
igual("nome e memo juntos", e.transacoes[1].descricao, "STONE PAGAMENTOS · CRED VENDAS");
igual("acento do 1252", e.transacoes[2].descricao, "TARIFA MANUTENÇÃO");
igual("FITID repetido não junta duas tarifas", e.transacoes[2].chave !== e.transacoes[3].chave, true);
igual("reler o mesmo arquivo dá as mesmas chaves", lerOfx(decodificarOfx(bytes)).transacoes.map((t) => t.chave), e.transacoes.map((t) => t.chave));

// O formato novo (XML), com tags fechadas e cartão de crédito.
const xml = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>4111********1111</ACCTID></CCACCTFROM>
<BANKTRANLIST><DTSTART>20261001</DTSTART><DTEND>20261031</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261015</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>X9</FITID><MEMO>Netflix &amp; Co</MEMO></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>-89.90</BALAMT><DTASOF>20261031</DTASOF></LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
const x = lerOfx(decodificarOfx(new TextEncoder().encode(xml)));
igual("XML: uma transação", x.transacoes.length, 1);
igual("XML: entidade e valor", [x.transacoes[0].descricao, x.transacoes[0].valor], ["Netflix & Co", -89.9]);
igual("XML: saldo", x.saldoFinal, -89.9);

igual("milhar no padrão americano", lerOfx("<OFX><STMTTRN><DTPOSTED>20261001<TRNAMT>1,234.56<FITID>1</STMTTRN>").transacoes[0].valor, 1234.56);

let erro = "";
try {
  lerOfx("Data;Valor\n01/10/2026;10");
} catch (err) {
  erro = (err as Error).message;
}
igual("CSV não passa por OFX", erro.startsWith("Este arquivo não é um extrato OFX"), true);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
