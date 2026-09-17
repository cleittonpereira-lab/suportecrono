import { describe, expect, it } from "vitest";
import { mesclarEnsaio, mesclarFotos, mudaAlgo, preservarConteudoDasFotos, type EnsaioFile } from "./lab-entities.functions";
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

const foto = (id: string): Photo => ({ id, dataUrl: `data:${id}`, createdAt: base.createdAt, kind: "outro" });

describe("mesclarFotos (duas pessoas no mesmo ensaio)", () => {
  it("sem base (chamador antigo/sem controle): aceita as recebidas como estão", () => {
    expect(mesclarFotos([foto("a")], undefined, [foto("b")])).toEqual([foto("b")]);
  });

  it("outra aba adicionou uma foto que este cliente nem sabia que existia: não apaga", () => {
    // Este cliente só editou um campo de texto — sua base e o que ele manda são iguais.
    const r = mesclarFotos([foto("a")], [], []);
    expect(r).toEqual([foto("a")]);
  });

  it("este cliente adiciona uma foto enquanto o servidor já tinha outra de outra aba", () => {
    const r = mesclarFotos([foto("a")], [], [foto("b")]);
    expect(r.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("este cliente apaga uma foto que ele conhecia; preserva a que outra aba adicionou depois", () => {
    // Base = [a]: este cliente viu só "a" da última vez. Servidor já tem [a, c].
    const r = mesclarFotos([foto("a"), foto("c")], [foto("a")], []);
    expect(r.map((p) => p.id)).toEqual(["c"]);
  });

  it("este cliente edita a legenda de uma foto que outra aba também tocou (conteúdo, não a lista)", () => {
    const editada = { ...foto("a"), caption: "Ruptura CP2" };
    const r = mesclarFotos([foto("a")], [foto("a")], [editada]);
    expect(r).toEqual([editada]);
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
