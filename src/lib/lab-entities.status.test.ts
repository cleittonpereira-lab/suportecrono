import { describe, expect, it } from "vitest";
import { mesclarEnsaio, type EnsaioFile } from "./lab-entities.functions";

const existente = (extra: Partial<EnsaioFile> = {}) =>
  ({ id: "en_1", amostraId: "am_1", tipo: "perm-v", status: "rascunho", rev: 3, ...extra }) as unknown as EnsaioFile;

const gravacao = (status: string) =>
  ({
    id: "en_1",
    amostraId: "am_1",
    tipo: "perm-v",
    status,
    createdAt: "2026-09-14T12:00:00.000Z",
    updatedAt: "2026-09-14T13:00:00.000Z",
  }) as never;

describe("gravação do laudo não aprova por fora do fluxo", () => {
  it.each(["aprovado", "aguardando_verificacao", "aguardando_aprovacao", "concluido"])(
    "status '%s' vindo da tela é ignorado (fica o do arquivo)",
    (status) => {
      expect(mesclarEnsaio(existente(), gravacao(status)).status).toBe("rascunho");
    },
  );

  it("status de digitação continua sendo gravado pela tela", () => {
    expect(mesclarEnsaio(existente(), gravacao("em_digitacao")).status).toBe("em_digitacao");
    expect(mesclarEnsaio(existente(), gravacao("processando")).status).toBe("processando");
  });

  it("'concluído fora (Excel)', ao arquivar a OS, continua sendo gravado", () => {
    expect(mesclarEnsaio(existente(), gravacao("concluido_externo")).status).toBe("concluido_externo");
  });

  it("o status que o fluxo gravou não é desfeito por uma gravação da tela", () => {
    expect(mesclarEnsaio(existente({ status: "aprovado" }), gravacao("aprovado")).status).toBe("aprovado");
  });
});
