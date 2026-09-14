import { describe, expect, it } from "vitest";
import { mesclarEnsaio, mudaAlgo, preservarConteudoDasFotos, type EnsaioFile } from "./lab-entities.functions";
import type { Photo } from "@/features/lab/types";

const base = {
  id: "en_1",
  amostraId: "am_1",
  tipo: "compressao-simples",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
};

function existente(extra: Partial<EnsaioFile> = {}): EnsaioFile {
  return {
    ...base,
    status: "aprovado",
    label: "Compressão Simples — Solo",
    nome: null,
    sigla: null,
    operator: "Cleitton",
    photos: [],
    payload: { corposDeProva: [{ picoCarga: 21.2 }] },
    rev: 7,
    ...extra,
  } as EnsaioFile;
}

describe("mesclarEnsaio", () => {
  it("com rascunho compartilhado, NÃO aceita payload do labStore", () => {
    // Cenário real: a tela abriu com o formulário vazio (leitura remota falhou)
    // e o onPayloadChange mandou o vazio. O rascunho verdadeiro fica.
    const r = mesclarEnsaio(existente({ draftRev: 12 }), { ...base, payload: { corposDeProva: [] } });
    expect(r.payload).toEqual({ corposDeProva: [{ picoCarga: 21.2 }] });
  });

  it("sem rascunho compartilhado, aceita o payload", () => {
    const r = mesclarEnsaio(existente(), { ...base, payload: { novo: true } });
    expect(r.payload).toEqual({ novo: true });
  });

  it("preserva aprovações, comentários e workflowStatus", () => {
    const aprov = [{ id: "a1", rev: 0, status: "aprovado" }] as unknown as EnsaioFile["reportApprovals"];
    const r = mesclarEnsaio(existente({ reportApprovals: aprov, workflowStatus: "aprovado" }), { ...base });
    expect(r.reportApprovals).toBe(aprov);
    expect(r.workflowStatus).toBe("aprovado");
  });

  it("campo omitido não apaga o existente e a revisão sobe", () => {
    const r = mesclarEnsaio(existente(), { ...base });
    expect(r.operator).toBe("Cleitton");
    expect(r.status).toBe("aprovado");
    expect(r.rev).toBe(8);
    expect(r.createdAt).toBe(base.createdAt);
  });

  it("ensaio novo nasce com rev 1 e o payload enviado", () => {
    const r = mesclarEnsaio(null, { ...base, payload: { x: 1 } });
    expect(r.rev).toBe(1);
    expect(r.payload).toEqual({ x: 1 });
  });
});

const fotoAntiga: Photo = { id: "ph_1", dataUrl: "data:image/jpeg;base64,AAAA", createdAt: base.createdAt, kind: "ruptura" };
const fotoLeve = (p: Photo): Photo => ({ ...p, dataUrl: "" });

describe("fotos leves do carregamento em massa", () => {
  it("troca de status pela Central NÃO apaga a imagem de foto antiga (só dataUrl)", () => {
    // O labStore manda as fotos como vieram do loadLabTree: sem conteúdo.
    const r = mesclarEnsaio(
      existente({ photos: [fotoAntiga] }),
      {
        ...base,
        status: "concluido_externo",
        photos: [fotoLeve(fotoAntiga)] as unknown as Record<string, unknown>[],
      },
      { podeConcluirFora: true },
    );
    expect(r.photos[0].dataUrl).toBe(fotoAntiga.dataUrl);
    expect(r.status).toBe("concluido_externo");
  });

  it("foto com arquivo no Drive (url) não recebe o base64 antigo de volta", () => {
    const migrada: Photo = { ...fotoAntiga, dataUrl: "", url: "/api/photo/abc" };
    expect(preservarConteudoDasFotos([migrada], [fotoAntiga])[0].dataUrl).toBe("");
  });

  it("foto removida pelo cliente continua removida", () => {
    expect(preservarConteudoDasFotos([], [fotoAntiga])).toEqual([]);
  });
});

describe("mudaAlgo", () => {
  it("só rev/updatedAt diferentes não é mudança", () => {
    const a = existente();
    expect(mudaAlgo(a, { ...a, rev: 99, updatedAt: "2026-09-13T00:00:00.000Z" })).toBe(false);
  });

  it("payload ignorado por rascunho compartilhado não gera gravação", () => {
    const atual = existente({ draftRev: 3 });
    const proximo = mesclarEnsaio(atual, { ...base, payload: { outro: 1 }, updatedAt: "2026-09-13T00:00:00.000Z" });
    expect(mudaAlgo(atual, proximo)).toBe(false);
  });

  it("mudança de status é mudança; arquivo novo também", () => {
    const atual = existente();
    expect(mudaAlgo(atual, mesclarEnsaio(atual, { ...base, status: "rascunho" }))).toBe(true);
    expect(mudaAlgo(null, atual)).toBe(true);
  });
});
