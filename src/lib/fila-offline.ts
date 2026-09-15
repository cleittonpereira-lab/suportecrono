/**
 * Fila de envios da bancada sem rede (Fase 5 — app instalável).
 *
 * As telas de bancada (leitura do QR → digitação no celular) gravam a
 * pendência de digitação no servidor. Sem sinal, a gravação fica no IndexedDB
 * do aparelho — uma por pendência, a mais recente vence — e sai quando a rede
 * volta. A pendência criada sem rede recebe o mesmo id que o servidor daria
 * (lib/pendencia-chave.ts), então a tela segue funcionando offline e nada se
 * duplica: a criação no servidor é idempotente.
 *
 * A fila não é apagada ao sair da conta: é trabalho de bancada ainda não
 * entregue. O envio usa a sessão de quem estiver logado quando a rede voltar.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  atualizarPendenciaDigitacao,
  criarPendenciaDigitacao,
  listPendenciasDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { chaveDaPendencia } from "@/lib/pendencia-chave";
import { estaOnline, semRede } from "@/lib/rede";

export interface CriarPendencia {
  os: string;
  amostra: string | null;
  ensaio: string;
  tipo_ensaio: string;
  origem: "digitalizacao";
  payload: Record<string, unknown>;
}

export interface AtualizarPendencia {
  /** "digitado": M.ESP.A finalizada a partir de uma pendência que já existia. */
  status: "em_digitacao" | "pendente" | "digitado";
  observacao?: string | null;
  payload: Record<string, unknown>;
}

export interface EnvioGuardado {
  pid: string;
  /** Criar a pendência antes de atualizar — quando ela nasceu sem rede. */
  criar?: CriarPendencia;
  atualizar?: AtualizarPendencia;
  guardadoEm: string;
  tentativas: number;
  ultimoErro?: string;
}

// ---------------- IndexedDB ----------------

const DB_NOME = "suporte-fila-offline";
const STORE = "envios";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "pid" });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function naStore<T>(modo: IDBTransactionMode, fazer: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, modo);
      const req = fazer(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

const ler = (pid: string) => naStore<EnvioGuardado | undefined>("readonly", (s) => s.get(pid));
const listar = () => naStore<EnvioGuardado[]>("readonly", (s) => s.getAll());
const gravar = (e: EnvioGuardado) => naStore("readwrite", (s) => s.put(e));
const apagar = (pid: string) => naStore("readwrite", (s) => s.delete(pid));

// ---------------- Estado para a tela ----------------

type Estado = { quantidade: number; enviando: boolean; ultimoErro: string | null };
const SEM_ESTADO: Estado = { quantidade: 0, enviando: false, ultimoErro: null };
let estado: Estado = SEM_ESTADO;
const ouvintes = new Set<() => void>();

function mudar(p: Partial<Estado>) {
  estado = { ...estado, ...p };
  ouvintes.forEach((f) => f());
}

async function recontar() {
  try {
    const todos = await listar();
    mudar({ quantidade: todos.length, ultimoErro: todos.find((e) => e.ultimoErro)?.ultimoErro ?? null });
  } catch {
    // IndexedDB indisponível (modo privado antigo): a fila simplesmente não existe
  }
}

/** Quantos envios estão guardados no aparelho, se estão saindo agora e o último erro. */
export function useFilaOffline(): Estado {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => estado,
    () => SEM_ESTADO,
  );
}

// ---------------- Gravar ----------------

const ORDEM_STATUS: Record<AtualizarPendencia["status"], number> = { em_digitacao: 0, pendente: 1, digitado: 2 };

async function guardar(pid: string, parte: { criar?: CriarPendencia; atualizar?: AtualizarPendencia }) {
  const atual = await ler(pid);
  let atualizar = parte.atualizar ?? atual?.atualizar;
  if (parte.atualizar && atual?.atualizar) {
    // Finalizada sem rede e editada de novo: continua finalizada (vale o status mais adiantado).
    const status =
      ORDEM_STATUS[atual.atualizar.status] > ORDEM_STATUS[parte.atualizar.status]
        ? atual.atualizar.status
        : parte.atualizar.status;
    atualizar = { ...parte.atualizar, status, observacao: parte.atualizar.observacao ?? atual.atualizar.observacao };
  }
  await gravar({
    pid,
    criar: atual?.criar ?? parte.criar,
    atualizar,
    guardadoEm: new Date().toISOString(),
    tentativas: atual?.tentativas ?? 0,
  });
  await recontar();
}

/**
 * Cria a pendência da bancada (QR lido). Sem rede, fica guardada e devolve o
 * id que o servidor dará — a tela abre normalmente.
 */
export async function criarPendenciaDeCampo(criar: CriarPendencia): Promise<{ pid: string; guardada: boolean }> {
  const pid = chaveDaPendencia(criar.os, criar.amostra, criar.ensaio);
  if (estaOnline()) {
    try {
      const r = await criarPendenciaDigitacao({ data: criar });
      return { pid: r.id, guardada: false };
    } catch (err) {
      if (!semRede(err)) throw err;
    }
  }
  await guardar(pid, { criar });
  return { pid, guardada: true };
}

/**
 * Atualiza a pendência (rascunho ou finalização). Sem rede, fica guardada. Se
 * a criação dela ainda está na fila, a atualização vai junto, na ordem certa.
 */
export async function atualizarPendenciaDeCampo(pid: string, atualizar: AtualizarPendencia): Promise<{ guardada: boolean }> {
  const naFila = await ler(pid).catch(() => undefined);
  if (estaOnline() && !naFila?.criar) {
    try {
      await atualizarPendenciaDigitacao({ data: { id: pid, ...atualizar } });
      // Uma atualização antiga que ficou na fila não pode sobrescrever esta depois.
      if (naFila) {
        await apagar(pid);
        await recontar();
      }
      return { guardada: false };
    } catch (err) {
      if (!semRede(err)) throw err;
    }
  }
  await guardar(pid, { atualizar });
  if (estaOnline()) void processarFila();
  return { guardada: true };
}

/**
 * Mesma forma de `criarPendenciaDigitacao({ data })` e de
 * `atualizarPendenciaDigitacao({ data })` — as telas de bancada trocam uma
 * pela outra sem mudar as chamadas —, mas sem rede guardam no aparelho.
 */
export async function criarPendenciaOuGuardar({ data }: { data: CriarPendencia }): Promise<{ id: string; guardada: boolean }> {
  const r = await criarPendenciaDeCampo(data);
  return { id: r.pid, guardada: r.guardada };
}

export async function atualizarPendenciaOuGuardar({
  data,
}: {
  data: { id: string } & AtualizarPendencia;
}): Promise<{ guardada: boolean }> {
  const { id, ...atualizar } = data;
  return atualizarPendenciaDeCampo(id, atualizar);
}

export interface PendenciaDaBancada {
  id: string;
  os: string;
  amostra: string | null;
  payload: unknown;
}

/**
 * A pendência que a tela de bancada abre: a do servidor ou, sem rede, a
 * guardada no aparelho. O que está na fila ainda não saiu, então é mais novo
 * que o do servidor e vence.
 */
export function usePendenciaDaBancada(
  pendenciaId: string | null,
  chaveDaConsulta: string,
): { pendencia: PendenciaDaBancada | null; carregando: boolean } {
  const consulta = useQuery({
    queryKey: [chaveDaConsulta],
    queryFn: () => listPendenciasDigitacao(),
    staleTime: 5_000,
    retry: (tentativa, err) => !semRede(err) && tentativa < 3,
  });
  const [guardado, setGuardado] = useState<EnvioGuardado | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    setGuardado(undefined);
    if (!pendenciaId) setGuardado(null);
    else void envioGuardado(pendenciaId).then((e) => vivo && setGuardado(e ?? null));
    return () => {
      vivo = false;
    };
  }, [pendenciaId]);

  const doServidor = ((consulta.data ?? []) as PendenciaDigitacao[]).find((p) => p.id === pendenciaId) ?? null;
  let pendencia: PendenciaDaBancada | null = doServidor
    ? { id: doServidor.id, os: doServidor.os, amostra: doServidor.amostra, payload: doServidor.payload }
    : null;
  if (pendenciaId && guardado) {
    const payloadGuardado = guardado.atualizar?.payload ?? guardado.criar?.payload;
    if (pendencia && guardado.atualizar) {
      pendencia = { ...pendencia, payload: { ...((pendencia.payload as object | null) ?? {}), ...guardado.atualizar.payload } };
    } else if (!pendencia && payloadGuardado) {
      const ident = (payloadGuardado as { ident?: { os?: string; amostraCodigo?: string } }).ident;
      pendencia = {
        id: pendenciaId,
        os: guardado.criar?.os ?? ident?.os ?? "",
        amostra: guardado.criar?.amostra ?? ident?.amostraCodigo ?? null,
        payload: payloadGuardado,
      };
    }
  }
  const carregando = !pendencia && (guardado === undefined || consulta.isPending);
  return { pendencia, carregando };
}

/** O que está guardado para esta pendência — a tela usa para abrir sem rede. */
export async function envioGuardado(pid: string): Promise<EnvioGuardado | undefined> {
  try {
    return await ler(pid);
  } catch {
    return undefined;
  }
}

// ---------------- Enviar ----------------

let processando = false;

/** Envia o que está guardado. Para no primeiro erro de rede ou de login; outros erros ficam anotados. */
export async function processarFila(): Promise<void> {
  if (processando || !estaOnline() || typeof indexedDB === "undefined") return;
  processando = true;
  mudar({ enviando: true });
  try {
    for (const e of await listar()) {
      try {
        if (e.criar) await criarPendenciaDigitacao({ data: e.criar });
        if (e.atualizar) await atualizarPendenciaDigitacao({ data: { id: e.pid, ...e.atualizar } });
        await apagar(e.pid);
      } catch (err) {
        if (semRede(err)) break;
        const msg = err instanceof Error ? err.message : String(err);
        await gravar({ ...e, tentativas: e.tentativas + 1, ultimoErro: msg });
        if (/não autenticado|nao autenticado/i.test(msg)) break;
      }
    }
  } catch (err) {
    console.warn("[fila-offline] Falha ao ler a fila:", err);
  } finally {
    processando = false;
    await recontar();
    mudar({ enviando: false });
  }
}

let iniciada = false;

/** Liga o envio automático: ao abrir o app, quando a rede volta e a cada 30 s enquanto houver fila. */
export function iniciarFilaOffline(): void {
  if (iniciada || typeof window === "undefined" || typeof indexedDB === "undefined") return;
  iniciada = true;
  window.addEventListener("online", () => void processarFila());
  window.setInterval(() => {
    if (estado.quantidade > 0) void processarFila();
  }, 30_000);
  void recontar().then(() => processarFila());
}
