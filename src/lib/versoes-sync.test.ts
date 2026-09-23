import { describe, expect, it } from "vitest";
import { MARCA_DO_DRIVE, planoDeSincronizacao, type VersaoLocalMin } from "./versoes-sync";

const remota = (rev: number, updatedAt: string, filename = `17700-26_13314-089_PERM.V_Rev-0${rev}.pdf`) => ({
  rev,
  filename,
  size: 1000,
  updatedAt,
});
const local = (rev: number, createdAt: string, extra: Partial<VersaoLocalMin> = {}): VersaoLocalMin => ({
  id: `v${rev}`,
  rev,
  createdAt,
  filename: `PERM-V_17700-26_Rev-0${rev}.pdf`,
  ...extra,
});

describe("versões: o que trazer do Drive", () => {
  it("revisão que só existe no Drive (salva em outro computador) é baixada", () => {
    expect(planoDeSincronizacao([], [remota(0, "2026-09-14T17:12:40Z")])).toEqual([
      { tipo: "baixar", remota: remota(0, "2026-09-14T17:12:40Z") },
    ]);
  });

  it("cópia local gerada aqui e PDF do Drive assinado depois: troca pela do Drive", () => {
    const l = local(0, "2026-09-14T17:12:34Z");
    const [acao] = planoDeSincronizacao([l], [remota(0, "2026-09-14T18:15:00Z")]);
    expect(acao).toMatchObject({ tipo: "baixar", substitui: l });
  });

  it("cópia local gerada aqui, Drive sem mudança: só assume o nome oficial", () => {
    const l = local(0, "2026-09-14T17:12:34Z");
    const [acao] = planoDeSincronizacao([l], [remota(0, "2026-09-14T17:12:45Z")]);
    expect(acao).toMatchObject({ tipo: "renomear", local: l });
  });

  it("cópia já trazida do Drive: nada a fazer até o Drive mudar", () => {
    const l = local(0, "2026-09-14T17:12:40Z", { note: MARCA_DO_DRIVE + "2026-09-14T18:15:00Z" });
    expect(planoDeSincronizacao([l], [remota(0, "2026-09-14T18:15:00Z")])).toEqual([]);
    expect(planoDeSincronizacao([l], [remota(0, "2026-09-15T09:00:00Z")])[0]).toMatchObject({ tipo: "baixar", substitui: l });
  });

  it("versão local que não está no Drive fica como está", () => {
    expect(planoDeSincronizacao([local(3, "2026-09-14T17:00:00Z")], [])).toEqual([]);
  });

  it("duas cópias locais da mesma revisão (corrida entre sincronizações): mantém uma, remove a outra", () => {
    const a = local(0, "2026-09-14T17:12:34Z", { id: "va" });
    const b = local(0, "2026-09-14T17:12:34Z", { id: "vb" });
    const acoes = planoDeSincronizacao([a, b], [remota(0, "2026-09-14T17:12:45Z")]);
    expect(acoes).toHaveLength(2);
    expect(acoes).toContainEqual({ tipo: "remover_duplicata", local: b });
    expect(acoes.find((a) => a.tipo === "renomear")).toMatchObject({ tipo: "renomear", local: a });
  });

  it("duplicatas: a já marcada como vinda do Drive é a que fica", () => {
    const a = local(0, "2026-09-14T17:12:34Z", { id: "va" });
    const b = local(0, "2026-09-14T17:12:34Z", { id: "vb", note: MARCA_DO_DRIVE + "2026-09-14T17:12:45Z" });
    const acoes = planoDeSincronizacao([a, b], [remota(0, "2026-09-14T17:12:45Z")]);
    expect(acoes).toEqual([{ tipo: "remover_duplicata", local: a }]);
  });

  it("revisão excluída no Drive (lixeira) sai também daqui — só a cópia que veio do Drive", () => {
    const doDrive = local(1, "2026-09-14T17:12:34Z", { id: "d1", note: MARCA_DO_DRIVE + "2026-09-14T17:12:45Z" });
    const soLocal = local(2, "2026-09-14T17:12:34Z", { id: "l2" });
    const acoes = planoDeSincronizacao([doDrive, soLocal], [], true);
    expect(acoes).toEqual([{ tipo: "remover_excluida", local: doDrive }]);
  });

  it("sem a pasta no Drive (fora do ar, ensaio renomeado), nada é apagado", () => {
    const doDrive = local(1, "2026-09-14T17:12:34Z", { id: "d1", note: MARCA_DO_DRIVE + "2026-09-14T17:12:45Z" });
    expect(planoDeSincronizacao([doDrive], [], false)).toEqual([]);
  });
});
