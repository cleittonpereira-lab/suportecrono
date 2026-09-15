/**
 * Avisos no aparelho (Web Push) — o lado do navegador: ligar e desligar os
 * avisos neste aparelho. A chave pública VAPID é pública de propósito; a
 * privada é o segredo VAPID_PRIVATE_JWK do Worker (lib/avisos.server.ts).
 */
import { b64urlParaBytes } from "@/lib/avisos-logica";
import { cancelarAvisos, inscreverAvisos } from "@/lib/avisos.functions";

export const CHAVE_PUBLICA_VAPID =
  "BGj-8dgPyPw3AwGy4ulPotuZ5P-1eCYUNOAlRF9-F0aF0pTmNquBr3ShJS_gTfTlSbAjXLED3tgnjatujPVWGXM";

export type SituacaoAvisos = "sem-suporte" | "bloqueado" | "desligado" | "ligado";

export function avisosSuportados(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

/** O service worker ativo — sem ele (app ainda instalando, ou em modo de desenvolvimento) não há push. */
async function registroPronto(): Promise<ServiceWorkerRegistration> {
  const r = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((ok) => setTimeout(() => ok(null), 8000)),
  ]);
  if (!r) throw new Error("O app ainda não terminou de se instalar neste aparelho. Recarregue a página e tente de novo.");
  return r;
}

export async function situacaoAvisos(): Promise<SituacaoAvisos> {
  if (!avisosSuportados()) return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = await reg?.pushManager.getSubscription();
  return inscricao && Notification.permission === "granted" ? "ligado" : "desligado";
}

export async function ativarAvisos(): Promise<SituacaoAvisos> {
  if (!avisosSuportados()) return "sem-suporte";
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "desligado";
  const reg = await registroPronto();
  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlParaBytes(CHAVE_PUBLICA_VAPID) }));
  const j = inscricao.toJSON();
  await inscreverAvisos({
    data: {
      endpoint: j.endpoint ?? inscricao.endpoint,
      keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" },
      aparelho: navigator.userAgent.slice(0, 200),
    },
  });
  return "ligado";
}

export async function desativarAvisos(): Promise<SituacaoAvisos> {
  if (!avisosSuportados()) return "sem-suporte";
  const reg = await navigator.serviceWorker.getRegistration();
  const inscricao = await reg?.pushManager.getSubscription();
  if (inscricao) {
    await cancelarAvisos({ data: { endpoint: inscricao.endpoint } }).catch(() => {});
    await inscricao.unsubscribe();
  }
  return "desligado";
}
