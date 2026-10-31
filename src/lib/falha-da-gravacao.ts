/**
 * Resposta de `saveSharedDraft` que NÃO gravou nada (fora o conflito, tratado à
 * parte). Os draftStores liam `res.conflict` direto: sem resposta (Worker que
 * estourou o limite) a tela mostrava "Cannot read properties of undefined
 * (reading 'conflict')"; com `success: false` (registro grande demais para o
 * banco), o autosave marcava "salvo" e o botão Salvar dizia "Salvo." — os dados
 * ficavam só neste navegador sem ninguém saber.
 */
export function falhaDaGravacao(res: unknown): string | null {
  if (!res || typeof res !== "object") {
    return "o servidor não respondeu. Os dados continuam neste navegador — tente salvar de novo.";
  }
  const r = res as { success?: boolean; conflict?: boolean; error?: string };
  if (r.conflict || r.success) return null;
  return r.error || "o servidor recusou a gravação.";
}
