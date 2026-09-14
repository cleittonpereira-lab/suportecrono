/**
 * Sala de tempo real (Fase 3) — um Durable Object só para o laboratório.
 *
 * Cada aba aberta mantém um WebSocket com a sala. Quando uma requisição grava
 * no banco, o Worker manda à sala um aviso com os documentos gravados, e a
 * sala repassa a todas as abas: a outra tela atualiza na hora, em vez de
 * esperar a próxima consulta periódica. A sala também sabe qual laudo cada aba
 * tem aberto (presença), para o aviso "Fulano está com este relatório aberto".
 *
 * Usa a API de hibernação: conexões paradas não mantêm a sala acordada, o
 * "ping" das abas é respondido pelo próprio runtime, e os dados de cada
 * conexão ficam anexados ao socket (sobrevivem à hibernação). Nada é gravado
 * em disco — presença é só de quem está conectado agora.
 */
import { DurableObject } from "cloudflare:workers";
import {
  juntarDocs,
  lerAviso,
  lerMensagemDoCliente,
  listaDePresenca,
  type MensagemDaSala,
  type Presente,
} from "../lib/sala-logica";

export class SalaTempoReal extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/aviso" && request.method === "POST") {
      const docs = juntarDocs(lerAviso(await request.json().catch(() => null)));
      if (docs.length > 0) this.enviarATodos({ t: "mudou", docs });
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const par = new WebSocketPair();
      const cliente = par[0];
      const servidor = par[1];
      // Identidade conferida pelo Worker (api.tempo-real.tsx) — só ele chega aqui.
      const presente: Presente = {
        id: crypto.randomUUID(),
        userId: url.searchParams.get("uid") || "convidado",
        nome: (url.searchParams.get("nome") || "Convidado").slice(0, 80),
        onde: null,
        desde: new Date().toISOString(),
      };
      this.ctx.acceptWebSocket(servidor);
      servidor.serializeAttachment(presente);
      this.enviar(servidor, { t: "ola", id: presente.id, userId: presente.userId });
      this.enviar(servidor, { t: "presenca", lista: this.presentes() });
      return new Response(null, { status: 101, webSocket: cliente } as ResponseInit & { webSocket: WebSocket });
    }

    return new Response("Não encontrado", { status: 404 });
  }

  async webSocketMessage(ws: WebSocketComAnexo, mensagem: string | ArrayBuffer): Promise<void> {
    const m = lerMensagemDoCliente(mensagem);
    if (!m) return;
    const atual = ws.deserializeAttachment() as Presente | null;
    if (!atual || atual.onde === m.onde) return;
    ws.serializeAttachment({ ...atual, onde: m.onde, desde: new Date().toISOString() });
    this.enviarATodos({ t: "presenca", lista: this.presentes() });
  }

  async webSocketClose(ws: WebSocketComAnexo): Promise<void> {
    this.saiu(ws);
  }

  async webSocketError(ws: WebSocketComAnexo): Promise<void> {
    this.saiu(ws);
  }

  private saiu(ws: WebSocketComAnexo): void {
    try {
      ws.close();
    } catch {
      // já fechado
    }
    this.enviarATodos({ t: "presenca", lista: this.presentes(ws) }, ws);
  }

  private presentes(excluir?: WebSocket): Presente[] {
    return listaDePresenca(
      this.ctx
        .getWebSockets()
        .filter((w) => w !== excluir)
        .map((w) => (w as WebSocketComAnexo).deserializeAttachment() as Presente | null),
    );
  }

  private enviar(ws: WebSocket, msg: MensagemDaSala): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // conexão caindo: a aba reconecta sozinha
    }
  }

  private enviarATodos(msg: MensagemDaSala, excluir?: WebSocket): void {
    const texto = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excluir) continue;
      try {
        ws.send(texto);
      } catch {
        // idem
      }
    }
  }
}
