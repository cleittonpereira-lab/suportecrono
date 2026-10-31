import { describe, expect, it } from "vitest";
import { fotosAoAbrirOEditor } from "@/features/lab/fotos-ao-abrir";
import { fotosPublicadas } from "@/features/lab/photos";
import type { Photo } from "@/features/lab/types";
import { hashDadosDoLaudo } from "./dados-do-laudo";
import { fotosParaODrive, fileIdDaFoto } from "./fotos-para-o-drive";
import { semConteudoDasFotos } from "./fotos-do-rascunho";
import { mesclarEnsaio, type EnsaioFile } from "./lab-entities.functions";

const foto = (id: string, extra: Partial<Photo> = {}): Photo => ({
  id,
  dataUrl: "",
  url: `/api/photo/arq_${id}`,
  kind: "ruptura",
  createdAt: "2026-10-30T10:00:00.000Z",
  ...extra,
});

/** Gravação do labStore (upsertEnsaioFn), com a base de fotos que o cliente conhecia. */
function gravarPeloLabStore(existente: EnsaioFile | null, fotos: Photo[], base: Photo[] | undefined): EnsaioFile {
  return mesclarEnsaio(existente, {
    id: "en_1",
    amostraId: "am_1",
    tipo: "triaxial-uu",
    photos: fotos as never,
    photosBase: base as never,
    createdAt: "2026-10-30T09:00:00.000Z",
    updatedAt: new Date().toISOString(),
  } as never);
}

/** O carregamento em massa entrega as fotos sem o conteúdo (photoToLightweight). */
const leves = (fotos: Photo[] | null | undefined) => (fotos ?? []).map((p) => ({ ...p, dataUrl: "" }));

describe("fotosAoAbrirOEditor", () => {
  it("rascunho atrasado (sem a foto) não tira nada do ensaio", () => {
    expect(fotosAoAbrirOEditor([foto("a"), foto("b")], [foto("a")])).toBeNull();
    expect(fotosAoAbrirOEditor([foto("a")], [])).toBeNull();
    expect(fotosAoAbrirOEditor([foto("a")], undefined)).toBeNull();
  });

  it("foto que só existe no rascunho (ensaio antigo) entra no fim", () => {
    expect(fotosAoAbrirOEditor([foto("a")], [foto("a"), foto("z")])?.map((p) => p.id)).toEqual(["a", "z"]);
    expect(fotosAoAbrirOEditor([], [foto("z")])?.map((p) => p.id)).toEqual(["z"]);
  });

  it("completa o conteúdo de foto do ensaio que chegou sem nenhum", () => {
    const semNada = foto("a", { url: undefined, dataUrl: "" });
    const r = fotosAoAbrirOEditor([semNada], [foto("a")]);
    expect(r?.[0].url).toBe("/api/photo/arq_a");
  });
});

describe("fluxo do laudo: foto anexada → salvar → enviar → aprovar → recarregar", () => {
  it("a foto continua no ensaio, na prévia, no PDF e na pasta do Drive", async () => {
    // 1. Ensaio com rascunho e sem foto.
    let arquivo: EnsaioFile = {
      ...gravarPeloLabStore(null, [], undefined),
      payload: { sample: { cp: 1 }, photos: [] },
      draftRev: 3,
    };

    // 2. Digitador anexa a foto (já enviada ao Drive: só a url) e salva.
    const p = foto("p1");
    arquivo = gravarPeloLabStore(arquivo, [p], []);
    expect(arquivo.photos?.map((f) => f.id)).toEqual(["p1"]);
    // O autosave do rascunho com a foto foi recusado (conflito): a cópia do rascunho ficou sem ela.
    expect((arquivo.payload as { photos: Photo[] }).photos).toEqual([]);

    // 3. Envio para verificação: a impressão digital fica gravada.
    const hashDoEnvio = await hashDadosDoLaudo(arquivo.payload, arquivo.photos);

    // 4. Verificador/aprovador abre o editor em outro computador: ensaio "leve" + rascunho do servidor.
    const naTela = leves(arquivo.photos as Photo[]);
    const doRascunho = semConteudoDasFotos(arquivo.payload as { photos: Photo[] }).photos;

    // Antes: setEnsaioPhotos(rascunho) e o labStore gravava a lista sem a foto → apagada no servidor.
    const comoEraAntes = gravarPeloLabStore(arquivo, doRascunho, naTela);
    expect(comoEraAntes.photos).toEqual([]);

    // Agora: nada muda nas fotos, nada é gravado, a trava de dados continua batendo.
    const aoAbrir = fotosAoAbrirOEditor(naTela, doRascunho);
    expect(aoAbrir).toBeNull();
    expect(await hashDadosDoLaudo(arquivo.payload, arquivo.photos)).toBe(hashDoEnvio);

    // 5. Aprovado e recarregado: a foto está no ensaio, na prévia/PDF (fotos publicadas) e vai ao Drive.
    const recarregado = leves(arquivo.photos as Photo[]);
    expect(recarregado.map((f) => f.id)).toEqual(["p1"]);
    const naPrevia = fotosPublicadas(recarregado);
    expect(naPrevia.map((f) => f.url || f.dataUrl)).toEqual(["/api/photo/arq_p1"]);
    expect(fotosParaODrive(recarregado)).toEqual([
      { cpId: "geral", filename: "ruptura_p1.jpg", mimeType: "image/jpeg", base64: "", fileId: "arq_p1" },
    ]);
  });
});

describe("fotosParaODrive", () => {
  it("foto em base64 vai com o conteúdo; foto com arquivo próprio vai pelo fileId; sem nada, fica de fora", () => {
    const r = fotosParaODrive(
      [
        foto("a", { url: undefined, dataUrl: "data:image/png;base64,QUJD", specimenId: "cp1" }),
        foto("b"),
        foto("c", { url: undefined, dataUrl: "" }),
      ],
      (p) => p.specimenId || "geral",
    );
    expect(r).toEqual([
      { cpId: "cp1", filename: "ruptura_a.png", mimeType: "image/png", base64: "QUJD" },
      { cpId: "geral", filename: "ruptura_b.jpg", mimeType: "image/jpeg", base64: "", fileId: "arq_b" },
    ]);
  });

  it("fileIdDaFoto", () => {
    expect(fileIdDaFoto("/api/photo/1AbC-x_9")).toBe("1AbC-x_9");
    expect(fileIdDaFoto("https://app.exemplo/api/photo/abc?v=1")).toBe("abc");
    expect(fileIdDaFoto("data:image/png;base64,xx")).toBeNull();
    expect(fileIdDaFoto(undefined)).toBeNull();
  });
});
