/**
 * Lista de versões igual em todos os computadores: traz do Drive as revisões
 * que faltam neste navegador e troca a cópia local quando o PDF do Drive mudou
 * (recebeu as assinaturas de verificação/aprovação). A regra está em
 * versoes-sync.ts; aqui, a execução e o aviso em tempo real.
 */
import { useEffect, useRef } from "react";
import { getRevisionPdfBase64, listDriveRevisions } from "./driveSync.functions";
import { planoDeSincronizacao, MARCA_DO_DRIVE, type VersaoLocalMin } from "./versoes-sync";
import { registroDoEnsaio } from "./sala-logica";
import { aoMudar } from "./tempo-real";

/** O que as telas passam para gravar/apagar no seu próprio histórico local (report-versions). */
export type ModuloDeVersoes = {
  saveVersion(v: {
    scopeId: string;
    rev: number;
    filename: string;
    size: number;
    pdfBlob: Blob;
    note?: string;
    createdAt?: string;
  }): Promise<unknown>;
  deleteVersion(id: string): Promise<unknown>;
};

function base64ParaBlob(b64: string): Blob {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: "application/pdf" });
}

/**
 * Uma chamada por vez por ensaio — o aviso em tempo real (debounce de 800ms)
 * e o `refreshVersions()` do mount/das ações de salvar podiam disparar quase
 * juntos; cada chamada lia a MESMA lista local "antes" e gravava sua própria
 * cópia da mesma revisão, criando várias linhas idênticas (nunca uma corrida
 * de verdade em paralelo — é só await de I/O — mas o intervalo entre ler e
 * gravar é o bastante pra duas chamadas se cruzarem).
 */
const emAndamento = new Map<string, Promise<boolean>>();

/** Devolve `true` se mudou alguma coisa na lista local (a tela relê). */
export async function sincronizarVersoesComDrive(
  scopeId: string,
  locais: (VersaoLocalMin & { pdfBlob: Blob })[],
  modulo: ModuloDeVersoes,
): Promise<boolean> {
  const emVoo = emAndamento.get(scopeId);
  if (emVoo) return emVoo;
  const promessa = sincronizarAgora(scopeId, locais, modulo).finally(() => {
    if (emAndamento.get(scopeId) === promessa) emAndamento.delete(scopeId);
  });
  emAndamento.set(scopeId, promessa);
  return promessa;
}

async function sincronizarAgora(
  scopeId: string,
  locais: (VersaoLocalMin & { pdfBlob: Blob })[],
  modulo: ModuloDeVersoes,
): Promise<boolean> {
  if (!registroDoEnsaio(scopeId)) return false;
  let remotas;
  try {
    remotas = (await listDriveRevisions({ data: { scopeId } })).revisions;
  } catch (err) {
    console.warn("[versões] Não foi possível consultar as revisões no Drive:", err);
    return false;
  }
  let mudou = false;
  for (const acao of planoDeSincronizacao(locais, remotas)) {
    try {
      if (acao.tipo === "remover_duplicata") {
        await modulo.deleteVersion(acao.local.id);
        mudou = true;
        continue;
      }
      const pdfBlob =
        acao.tipo === "renomear"
          ? acao.local.pdfBlob
          : base64ParaBlob((await getRevisionPdfBase64({ data: { scopeId, rev: acao.remota.rev } })).base64);
      const anterior = acao.tipo === "renomear" ? acao.local : acao.substitui;
      // Grava a nova antes de apagar a antiga: uma falha no meio não some com a versão.
      await modulo.saveVersion({
        scopeId,
        rev: acao.remota.rev,
        filename: acao.remota.filename,
        size: pdfBlob.size,
        pdfBlob,
        note: MARCA_DO_DRIVE + acao.remota.updatedAt,
        createdAt: anterior?.createdAt ?? acao.remota.criadoEm ?? acao.remota.updatedAt,
      });
      if (anterior) await modulo.deleteVersion(anterior.id);
      mudou = true;
    } catch (err) {
      const rev = acao.tipo === "remover_duplicata" ? acao.local.rev : acao.remota.rev;
      console.warn(`[versões] Falha ao trazer a Rev-${String(rev).padStart(2, "0")} do Drive:`, err);
    }
  }
  return mudou;
}

/**
 * Atualiza a lista de versões quando este laudo muda em outro computador
 * (nova revisão enviada, verificada, aprovada, PDF assinado) — pelo aviso de
 * tempo real, sem esperar a pessoa recarregar a tela.
 */
export function useVersoesAoVivo(scopeId: string, atualizar: () => unknown): void {
  const atual = useRef(atualizar);
  useEffect(() => {
    atual.current = atualizar;
  });
  useEffect(() => {
    const registro = registroDoEnsaio(scopeId);
    if (!registro) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const parar = aoMudar((docs) => {
      if (!docs.some((d) => d.pasta === "lab-ensaios" && d.nome === registro)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void atual.current(), 800);
    });
    return () => {
      clearTimeout(timer);
      parar();
    };
  }, [scopeId]);
}
