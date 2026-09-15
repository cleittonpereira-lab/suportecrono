/**
 * App instalável (Fase 5): avisa quando o aparelho está sem rede e quantos
 * envios da bancada estão guardados esperando para sair. Também liga o
 * service worker e o envio automático da fila.
 */
import { useEffect, useSyncExternalStore } from "react";
import { CloudOff, Loader2, UploadCloud } from "lucide-react";
import { iniciarFilaOffline, processarFila, useFilaOffline } from "@/lib/fila-offline";
import { registrarServiceWorker } from "@/lib/pwa";

function assinarRede(f: () => void) {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  return () => {
    window.removeEventListener("online", f);
    window.removeEventListener("offline", f);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(assinarRede, () => navigator.onLine, () => true);
}

export function FilaOfflineAviso() {
  const online = useOnline();
  const { quantidade, enviando, ultimoErro } = useFilaOffline();

  useEffect(() => {
    registrarServiceWorker();
    iniciarFilaOffline();
  }, []);

  if (online && quantidade === 0) return null;

  const envios = quantidade === 1 ? "1 envio guardado" : `${quantidade} envios guardados`;
  let texto: string;
  let Icone = UploadCloud;
  if (!online) {
    Icone = CloudOff;
    texto =
      quantidade > 0
        ? `Sem rede — ${envios} no aparelho; saem quando a rede voltar`
        : "Sem rede — o que for digitado na bancada fica guardado no aparelho";
  } else if (enviando) {
    Icone = Loader2;
    texto = `Enviando ${envios}…`;
  } else {
    texto = ultimoErro ? `${envios} não saíram: ${ultimoErro}` : `${envios} aguardando envio`;
  }

  return (
    <div
      role="status"
      className="fixed bottom-3 left-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur"
    >
      <Icone className={`h-3.5 w-3.5 shrink-0 ${!online ? "text-amber-600" : "text-primary"} ${enviando ? "animate-spin" : ""}`} />
      <span className="truncate">{texto}</span>
      {online && !enviando && quantidade > 0 && (
        <button type="button" className="shrink-0 font-semibold text-primary hover:underline" onClick={() => void processarFila()}>
          Enviar agora
        </button>
      )}
    </div>
  );
}
