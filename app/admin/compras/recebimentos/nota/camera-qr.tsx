"use client";

import { Camera, ImageUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** O leitor de QR do próprio navegador (Chrome no Android). O iPhone não tem. */
type Detector = { detect: (fonte: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type ComDetector = { BarcodeDetector?: new (o: { formats: string[] }) => Detector };

/** Lê o QR de uma imagem desenhada no canvas, pelo `jsqr` (carregado só quando precisa). */
async function lerDoCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { default: jsQR } = await import("jsqr");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

/**
 * A câmera apontada para o QR do cupom. Lê sozinha, sem botão: quando acha,
 * desliga a câmera e entrega o texto.
 *
 * Usa o leitor do navegador quando existe (mais rápido) e o `jsqr` quando
 * não. Sem câmera ou sem permissão, sobra "tirar foto" (a câmera do sistema)
 * e colar o link.
 */
export function CameraQr({ aoLer }: { aoLer: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ligada, setLigada] = useState(false);
  const lido = useRef(false);

  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let parado = false;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const detectorCls = (window as unknown as ComDetector).BarcodeDetector;
    const detector = detectorCls ? new detectorCls({ formats: ["qr_code"] }) : null;

    async function procurar() {
      if (parado || lido.current) return;
      const v = video.current;
      const c = canvas.current;
      if (v && c && v.readyState >= 2 && v.videoWidth > 0) {
        try {
          let texto: string | null = null;
          if (detector) {
            texto = (await detector.detect(v))[0]?.rawValue ?? null;
          } else {
            // Uma fatia do quadro, reduzida: o jsqr em tela cheia trava o celular.
            const escala = Math.min(1, 640 / v.videoWidth);
            c.width = Math.round(v.videoWidth * escala);
            c.height = Math.round(v.videoHeight * escala);
            c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
            texto = await lerDoCanvas(c);
          }
          if (texto && !lido.current) {
            lido.current = true;
            fluxo?.getTracks().forEach((t) => t.stop());
            aoLer(texto);
            return;
          }
        } catch {
          // Um quadro que falhou não para a leitura: tenta o próximo.
        }
      }
      espera = setTimeout(procurar, 250);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro("Este navegador não abre a câmera aqui. Use \"Tirar foto\" ou cole o link.");
        return;
      }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (parado) return fluxo.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = fluxo;
          await video.current.play().catch(() => {});
        }
        setLigada(true);
        procurar();
      } catch {
        setErro("A câmera não abriu (sem permissão?). Use \"Tirar foto\" ou cole o link.");
      }
    })();

    return () => {
      parado = true;
      if (espera) clearTimeout(espera);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, [aoLer]);

  /** A foto tirada pela câmera do sistema: o caminho que sempre funciona. */
  async function daFoto(arquivo: File) {
    setErro(null);
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = canvas.current!;
      const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      const texto = await lerDoCanvas(c);
      if (texto) aoLer(texto);
      else setErro("Não achei o QR nesta foto. Tire de novo, mais perto e com o QR inteiro.");
    } catch {
      setErro("Não consegui abrir a foto.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black">
        <video ref={video} playsInline muted className="size-full object-cover" />
        {/* A moldura: onde pôr o QR. */}
        {ligada && (
          <span aria-hidden className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80" />
        )}
        {!ligada && !erro && (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            <Camera aria-hidden className="mr-2 size-5" />
            Abrindo a câmera…
          </span>
        )}
      </div>
      <canvas ref={canvas} className="hidden" />
      {erro && (
        <p role="alert" className="text-sm" style={{ color: "var(--warn)" }}>
          {erro}
        </p>
      )}
      <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium hover:border-[var(--primary)]">
        <ImageUp aria-hidden className="size-4" />
        Tirar foto do QR
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void daFoto(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
