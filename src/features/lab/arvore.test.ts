import { describe, expect, it } from "vitest";
import {
  aplicarSync,
  arvoreDoCache,
  cacheVazio,
  montarArvore,
  versoesConhecidas,
  type LinhaAmostra,
  type LinhaEnsaio,
  type LinhaOS,
  type RespostaSync,
} from "./arvore";

const datas = { createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" };
const os1: LinhaOS = { id: "os_1", numero: "17960-26", ...datas };
const am1: LinhaAmostra = { id: "am_1", osId: "os_1", reportNumber: "13735-02", photos: [], ...datas };
const en1: LinhaEnsaio = { id: "en_1", amostraId: "am_1", tipo: "compressao-simples", status: "rascunho", ...datas };

function resposta(parcial: Partial<RespostaSync>): RespostaSync {
  return { os: [], amostras: [], ensaios: [], ordem: { os: [], amostras: [], ensaios: [] }, ...parcial };
}

const completa = resposta({
  os: [{ fileId: "f-os1", version: "3", dados: os1 }],
  amostras: [{ fileId: "f-am1", version: "5", dados: am1 }],
  ensaios: [{ fileId: "f-en1", version: "9", dados: en1 }],
  ordem: { os: ["f-os1"], amostras: ["f-am1"], ensaios: ["f-en1"] },
});

describe("montarArvore", () => {
  it("monta OS → amostra → ensaio sem os campos de vínculo, como o loadLabTree entregava", () => {
    const arvore = montarArvore([os1], [am1], [en1]);
    const amostra = arvore.os[0].amostras[0];
    expect(amostra).not.toHaveProperty("osId");
    expect(amostra.ensaios[0]).not.toHaveProperty("amostraId");
    expect(amostra.ensaios[0].id).toBe("en_1");
  });

  it("ensaio de amostra desconhecida fica de fora", () => {
    const orfao: LinhaEnsaio = { ...en1, id: "en_2", amostraId: "am_x" };
    const arvore = montarArvore([os1], [am1], [en1, orfao]);
    expect(arvore.os[0].amostras[0].ensaios.map((e) => e.id)).toEqual(["en_1"]);
  });
});

describe("sincronização incremental", () => {
  it("a primeira resposta traz tudo; a seguinte, sem mudança, não marca mudança", () => {
    const primeira = aplicarSync(cacheVazio(), completa);
    expect(primeira.mudou).toBe(true);
    expect(versoesConhecidas(primeira.cache)).toEqual({ "f-os1": "3", "f-am1": "5", "f-en1": "9" });

    const semMudanca = aplicarSync(primeira.cache, resposta({ ordem: completa.ordem }));
    expect(semMudanca.mudou).toBe(false);
    expect(arvoreDoCache(semMudanca.cache)).toEqual(arvoreDoCache(primeira.cache));
  });

  it("arquivo alterado substitui a linha", () => {
    const { cache } = aplicarSync(cacheVazio(), completa);
    const aprovado: LinhaEnsaio = { ...en1, status: "aprovado" };
    const r = aplicarSync(
      cache,
      resposta({ ensaios: [{ fileId: "f-en1", version: "10", dados: aprovado }], ordem: completa.ordem }),
    );
    expect(r.mudou).toBe(true);
    expect(arvoreDoCache(r.cache).os[0].amostras[0].ensaios[0].status).toBe("aprovado");
    expect(versoesConhecidas(r.cache)["f-en1"]).toBe("10");
  });

  it("arquivo que saiu da pasta sai da árvore", () => {
    const { cache } = aplicarSync(cacheVazio(), completa);
    const r = aplicarSync(cache, resposta({ ordem: { ...completa.ordem, ensaios: [] } }));
    expect(r.mudou).toBe(true);
    expect(arvoreDoCache(r.cache).os[0].amostras[0].ensaios).toEqual([]);
    expect(versoesConhecidas(r.cache)).not.toHaveProperty("f-en1");
  });

  it("mantém a ordem da listagem", () => {
    const os2: LinhaOS = { ...os1, id: "os_2", numero: "17850-26" };
    const r = aplicarSync(
      cacheVazio(),
      resposta({
        os: [
          { fileId: "f-os1", version: "1", dados: os1 },
          { fileId: "f-os2", version: "1", dados: os2 },
        ],
        ordem: { os: ["f-os2", "f-os1"], amostras: [], ensaios: [] },
      }),
    );
    expect(arvoreDoCache(r.cache).os.map((o) => o.numero)).toEqual(["17850-26", "17960-26"]);
  });
});
