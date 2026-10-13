// Um "banco longe" para medir: proxy TCP que atrasa cada pedaço de dado em
// `ms` milissegundos, nos dois sentidos (ida e volta = 2 × ms).
//
//   node scripts/desempenho/atraso.mjs 5434 5432 75   # :5434 -> Postgres em :5432, 150 ms de ida e volta
//
// Depois suba o app com DATABASE_URL apontando para a porta 5434.
import net from "node:net";

const [, , porta, destino, ms] = process.argv;
if (!porta || !destino || !ms) {
  console.error("uso: node scripts/desempenho/atraso.mjs <porta> <porta-do-postgres> <ms-por-sentido>");
  process.exit(1);
}
net
  .createServer((cliente) => {
    const banco = net.connect(Number(destino), "127.0.0.1");
    const passa = (de, para) => de.on("data", (d) => setTimeout(() => para.write(d), Number(ms)));
    passa(cliente, banco);
    passa(banco, cliente);
    const fim = () => {
      cliente.destroy();
      banco.destroy();
    };
    for (const s of [cliente, banco]) {
      s.on("error", fim);
      s.on("close", fim);
    }
  })
  .listen(Number(porta), "127.0.0.1", () => console.log(`atraso de ${ms} ms: :${porta} -> :${destino}`));
