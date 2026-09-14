/**
 * Tempo real no navegador (Fase 3): uma conexão por aba com a sala do servidor.
 *
 *  - "mudou": quem depende daqueles documentos atualiza na hora (`aoMudar`).
 *  - presença: qual laudo cada aba tem aberto (`definirOnde`, `useOutrosAqui`).
 *
 * Sem conexão — servidor sem a sala, rede caída, aba em segundo plano — tudo
 * segue pela consulta periódica de antes; a conexão volta sozinha.
 */
import { useSyncExternalStore } from "react";
import { outrosNoMesmoLugar, type DocMudado, type MensagemDaSala, type Presente } from "@/lib/sala-logica";

export type { DocMudado, Presente };

type Estado = {
  conectado: boolean;
  eu: { id: string; userId: string } | null;
  presentes: Presente[];
  onde: string | null;
};

let estado: Estado = { conectado: false, eu: null, presentes: [], onde: null };
const ouvintesEstado = new Set<() => void>();
const ouvintesMudanca = new Set<(docs: DocMudado[]) => void>();

let socket: WebSocket | null = null;
let tentativas = 0;
let timerReconexao: ReturnType<typeof setTimeout> | undefined;
let timerPing: ReturnType<typeof setInterval> | undefined;
let iniciado = false;

function mudarEstado(parcial: Partial<Estado>): void {
  estado = { ...estado, ...parcial };
  ouvintesEstado.forEach((f) => f());
}

function enviar(msg: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // a reconexão reenvia o estado
    }
  }
}

function tratar(m: MensagemDaSala): void {
  if (m.t === "ola") mudarEstado({ eu: { id: m.id, userId: m.userId } });
  else if (m.t === "presenca") mudarEstado({ presentes: m.lista });
  else if (m.t === "mudou") ouvintesMudanca.forEach((f) => f(m.docs));
}

function agendarReconexao(): void {
  clearTimeout(timerReconexao);
  // Espera crescente (1 s … 60 s): um servidor sem a sala (503) não vira uma
  // rajada de tentativas. Com a aba oculta, espera ela voltar.
  const espera = Math.min(60_000, 1000 * 2 ** Math.min(tentativas, 6));
  tentativas++;
  timerReconexao = setTimeout(() => {
    if (iniciado && document.visibilityState === "visible") conectar();
  }, espera);
}

function conectar(): void {
  if (socket) return;
  clearTimeout(timerReconexao);
  const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/tempo-real`;
  let s: WebSocket;
  try {
    s = new WebSocket(url);
  } catch {
    agendarReconexao();
    return;
  }
  socket = s;
  s.onopen = () => {
    tentativas = 0;
    mudarEstado({ conectado: true });
    if (estado.onde) enviar({ t: "onde", onde: estado.onde });
    // Mantém a conexão viva em proxies; o servidor responde sem acordar a sala.
    timerPing = setInterval(() => {
      try {
        s.send("ping");
      } catch {
        // idem
      }
    }, 45_000);
  };
  s.onmessage = (ev) => {
    if (typeof ev.data !== "string" || ev.data === "pong") return;
    try {
      tratar(JSON.parse(ev.data) as MensagemDaSala);
    } catch {
      // mensagem inválida: ignora
    }
  };
  s.onclose = () => {
    clearInterval(timerPing);
    if (socket === s) socket = null;
    mudarEstado({ conectado: false, presentes: [], eu: null });
    agendarReconexao();
  };
  s.onerror = () => {
    try {
      s.close();
    } catch {
      // idem
    }
  };
}

function aoVoltarParaAba(): void {
  if (iniciado && document.visibilityState === "visible" && !socket) conectar();
}

/** Abre a conexão da aba (uma vez só, no navegador). Só com conta: sem login o servidor recusa. */
export function iniciarTempoReal(): void {
  if (iniciado || typeof window === "undefined" || typeof WebSocket === "undefined") return;
  iniciado = true;
  conectar();
  document.addEventListener("visibilitychange", aoVoltarParaAba);
}

/** Fecha a conexão sem reconectar — ao sair da conta. */
export function pararTempoReal(): void {
  if (!iniciado) return;
  iniciado = false;
  document.removeEventListener("visibilitychange", aoVoltarParaAba);
  clearTimeout(timerReconexao);
  clearInterval(timerPing);
  tentativas = 0;
  const s = socket;
  socket = null;
  if (s) {
    s.onclose = null;
    s.onerror = null;
    try {
      s.close();
    } catch {
      // já fechada
    }
  }
  mudarEstado({ conectado: false, presentes: [], eu: null });
}

/** Chamado a cada aviso de "estes documentos mudaram". Devolve a função que para de ouvir. */
export function aoMudar(fn: (docs: DocMudado[]) => void): () => void {
  ouvintesMudanca.add(fn);
  return () => {
    ouvintesMudanca.delete(fn);
  };
}

/** Qual laudo (scopeId) esta aba tem aberto; `null` ao sair dele. */
export function definirOnde(onde: string | null): void {
  if (estado.onde === onde) return;
  mudarEstado({ onde });
  enviar({ t: "onde", onde });
}

export function tempoRealConectado(): boolean {
  return estado.conectado;
}

function assinar(fn: () => void): () => void {
  ouvintesEstado.add(fn);
  return () => {
    ouvintesEstado.delete(fn);
  };
}

const SEM_ESTADO: Estado = { conectado: false, eu: null, presentes: [], onde: null };

export function useTempoReal(): Estado {
  return useSyncExternalStore(
    assinar,
    () => estado,
    () => SEM_ESTADO,
  );
}

/** Outras pessoas com o mesmo laudo aberto agora (sem esta aba e sem a mesma pessoa em outra aba). */
export function useOutrosAqui(): Presente[] {
  const e = useTempoReal();
  return outrosNoMesmoLugar(e.presentes, e.eu, e.onde);
}
