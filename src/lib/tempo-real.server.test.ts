import { afterEach, describe, expect, it, vi } from "vitest";
import { comAvisosDeMudanca, salaTempoReal } from "./tempo-real.server";
import { registrarMudanca } from "./avisos-mudanca";

type Env = { SALA_TEMPO_REAL?: unknown; TEMPO_REAL?: string };

function ambiente(env: Env) {
  (globalThis as { __env__?: Env }).__env__ = env;
}

function salaFalsa() {
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  const ns = { idFromName: (n: string) => n, get: () => ({ fetch }) };
  return { ns, fetch };
}

afterEach(() => {
  delete (globalThis as { __env__?: Env }).__env__;
});

describe("aviso de mudança ao fim da requisição", () => {
  it("manda um aviso só, com tudo o que a requisição gravou, sem segurar a resposta", async () => {
    const { ns, fetch } = salaFalsa();
    ambiente({ SALA_TEMPO_REAL: ns });
    const esperarDepois = vi.fn();
    const req = Object.assign(new Request("https://app/x"), { waitUntil: esperarDepois });

    const r = await comAvisosDeMudanca(req, async () => {
      registrarMudanca("lab-ensaios", "a.json");
      registrarMudanca("lab-pendencias", "p.json");
      return "ok";
    });

    expect(r).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown[])[1] && ((fetch.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({
      docs: [
        { pasta: "lab-ensaios", nome: "a.json" },
        { pasta: "lab-pendencias", nome: "p.json" },
      ],
    });
    expect(esperarDepois).toHaveBeenCalledTimes(1);
  });

  it("requisição que não grava não chama a sala", async () => {
    const { ns, fetch } = salaFalsa();
    ambiente({ SALA_TEMPO_REAL: ns });
    await comAvisosDeMudanca(new Request("https://app/x"), async () => "só leitura");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("TEMPO_REAL=0 desliga sem publicar: nada de aviso, requisição igual", async () => {
    const { ns, fetch } = salaFalsa();
    ambiente({ SALA_TEMPO_REAL: ns, TEMPO_REAL: "0" });
    expect(salaTempoReal()).toBeNull();
    const r = await comAvisosDeMudanca(new Request("https://app/x"), async () => {
      registrarMudanca("lab-ensaios", "a.json");
      return 1;
    });
    expect(r).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("servidor sem a sala segue normalmente", async () => {
    ambiente({});
    expect(salaTempoReal()).toBeNull();
    await expect(comAvisosDeMudanca(new Request("https://app/x"), async () => "ok")).resolves.toBe("ok");
  });
});
