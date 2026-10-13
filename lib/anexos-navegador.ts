import { LADO_MAXIMO_DA_FOTO } from "@/lib/anexos";

/**
 * Foto de celular sai com 4 a 8 MB; para ler uma nota ou ver um serviço
 * feito, 1600 px em JPEG basta e fica abaixo de 500 KB. PDF e XML sobem como
 * estão.
 *
 * Só no navegador (usa canvas). Nasceu nos anexos do Financeiro e mora aqui
 * desde que o Tarefas precisou da mesma redução: nenhum módulo importa de
 * dentro de outro.
 */
export async function reduzirSeForFoto(arquivo: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(arquivo.type)) return arquivo;
  try {
    const img = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO_DA_FOTO / Math.max(img.width, img.height));
    if (escala === 1 && arquivo.size <= 1_000_000) return arquivo;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    return blob ?? arquivo;
  } catch {
    return arquivo;
  }
}

/**
 * A miniatura quadrada de uma foto (recortada no meio), para listas que
 * mostram muitas de uma vez: 240 px em JPEG fica em poucos KB. Nulo se o
 * navegador não conseguir ler a imagem.
 */
export async function miniaturaDaFoto(arquivo: Blob, lado = 240): Promise<Blob | null> {
  try {
    const img = await createImageBitmap(arquivo);
    const menor = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    canvas.getContext("2d")!.drawImage(img, (img.width - menor) / 2, (img.height - menor) / 2, menor, menor, 0, 0, lado, lado);
    return await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
  } catch {
    return null;
  }
}
