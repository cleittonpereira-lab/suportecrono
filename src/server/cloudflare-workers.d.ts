// Tipos mínimos do runtime do Cloudflare usados pela sala de tempo real e
// pelos avisos — o projeto não depende de @cloudflare/workers-types.

declare module "cloudflare:workers" {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  setWebSocketAutoResponse(par?: WebSocketRequestResponsePair): void;
  waitUntil(p: Promise<unknown>): void;
}

interface WebSocketComAnexo extends WebSocket {
  serializeAttachment(valor: unknown): void;
  deserializeAttachment(): unknown;
}

declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string);
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocketComAnexo;
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(nome: string): unknown;
  get(id: unknown): DurableObjectStub;
}
