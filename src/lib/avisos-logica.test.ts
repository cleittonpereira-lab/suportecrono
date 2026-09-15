import { describe, expect, it } from "vitest";
import {
  b64urlParaBytes,
  cabecalhoVapid,
  chavePublicaDaPrivada,
  descreverLaudo,
  destinatarios,
  montarAviso,
  urlDoLaudo,
  type ChavePrivadaVapid,
  type Pessoa,
} from "./avisos-logica";

const pessoas: Pessoa[] = [
  { id: "digitador", role: "usuario", labRole: "digitador" },
  { id: "gestor-verif", role: "gestor", labRole: "verificador" },
  { id: "gestor", role: "gestor", labRole: "nenhum" },
  { id: "rt", role: "admin", labRole: "aprovador" },
  { id: "bloqueado", role: "gestor", labRole: "verificador", status: "bloqueado" },
];

describe("quem recebe cada aviso", () => {
  it("verificação: quem pode verificar, menos quem enviou e contas bloqueadas", () => {
    expect(destinatarios("aguardando_verificacao", pessoas, "digitador")).toEqual(["gestor-verif", "gestor", "rt"]);
    expect(destinatarios("aguardando_verificacao", pessoas, "gestor-verif")).toEqual(["gestor", "rt"]);
  });

  it("aprovação: só quem aprova", () => {
    expect(destinatarios("aguardando_aprovacao", pessoas, "gestor-verif")).toEqual(["rt"]);
    expect(destinatarios("aguardando_aprovacao", pessoas, "rt")).toEqual([]);
  });

  it("reprovado: quem enviou a revisão", () => {
    expect(destinatarios("reprovado", pessoas, "rt", "digitador")).toEqual(["digitador"]);
    expect(destinatarios("reprovado", pessoas, "rt", "rt")).toEqual([]);
    expect(destinatarios("reprovado", pessoas, "rt", "bloqueado")).toEqual([]);
    expect(destinatarios("reprovado", pessoas, "rt", null)).toEqual([]);
  });
});

describe("texto e link do aviso", () => {
  it("descrição com o que houver; sem dados, o nome do arquivo", () => {
    expect(descreverLaudo({ ensaio: "PERM.V", os: "17700-26", amostra: "13314-089" })).toBe(
      "PERM.V · OS 17700-26 · amostra 13314-089",
    );
    expect(descreverLaudo({ arquivo: "17700-26_13314-089_PERM.V_Rev-00.pdf" })).toBe("17700-26_13314-089_PERM.V_Rev-00");
    expect(descreverLaudo({})).toBe("Laudo");
  });

  it("link para a página do laudo", () => {
    expect(urlDoLaudo("os/a1/amostra/b2/ensaio/c3")).toBe("/relatorio/os/a1/amostra/b2/ensaio/c3");
    expect(urlDoLaudo("local")).toBe("/relatorio/pendentes");
  });

  it("reprovado leva o motivo; os outros, quem enviou", () => {
    const r = montarAviso("reprovado", { descricao: "PERM.V · OS 1", ator: "Maurício", comentario: "Refazer a curva", scopeId: "x" });
    expect(r.titulo).toBe("Laudo devolvido para correção");
    expect(r.corpo).toBe("PERM.V · OS 1 — Refazer a curva (Maurício)");
    const v = montarAviso("aguardando_verificacao", { descricao: "PERM.V · OS 1", ator: "Bianca", scopeId: "x" });
    expect(v.corpo).toBe("PERM.V · OS 1 — enviado por Bianca");
  });
});

describe("assinatura VAPID", () => {
  it("JWT ES256 verificável com a chave pública, com aud/exp/sub certos", async () => {
    const par = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey("jwk", par.privateKey)) as unknown as ChavePrivadaVapid;
    const agora = Date.UTC(2026, 8, 15, 12, 0, 0);
    const h = await cabecalhoVapid("https://fcm.googleapis.com/fcm/send/abc", jwk, "mailto:contato@suportesolos.com.br", agora);

    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
    expect(m).not.toBeNull();
    const [, cab, decl, ass, k] = m!;
    expect(k).toBe(chavePublicaDaPrivada(jwk));
    expect(b64urlParaBytes(k)).toHaveLength(65);

    const declaracoes = JSON.parse(new TextDecoder().decode(b64urlParaBytes(decl)));
    expect(declaracoes).toEqual({ aud: "https://fcm.googleapis.com", exp: agora / 1000 + 12 * 3600, sub: "mailto:contato@suportesolos.com.br" });

    const valido = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      par.publicKey,
      b64urlParaBytes(ass),
      new TextEncoder().encode(`${cab}.${decl}`),
    );
    expect(valido).toBe(true);
  });
});
