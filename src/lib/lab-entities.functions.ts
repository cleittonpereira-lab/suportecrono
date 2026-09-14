/**
 * Persistência do labStore no Google Drive — um arquivo por entidade
 * (uma OS, uma amostra, um ensaio), não mais um arquivo único gigante.
 * Isso elimina a colisão de escrita entre usuários mexendo em entidades
 * diferentes ao mesmo tempo — cada um toca um arquivo diferente.
 *
 * Cada arquivo carrega um campo `rev` (revisão), incrementado a cada escrita.
 * Escritas fazem read-modify-write com a leitura e a gravação dentro do mesmo
 * `withKeyLock`, então duas escritas no MESMO arquivo, na mesma isolate, não se
 * atropelam. Entre isolates diferentes do Worker não há lock — o Google Drive
 * não tem transação real —, então duas escritas quase simultâneas no mesmo
 * arquivo vindas de isolates distintas ainda podem colidir (a última vence).
 * (Este comentário dizia antes que a rev esperada era comparada e a gravação
 * recusada em conflito; essa comparação nunca existiu no código.)
 */
import { createServerFn } from "@tanstack/react-start";
import { exigirLogin } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Amostra, Coords, Ensaio, EnsaioStatus, EnsaioTipo, LabState, OS, Photo } from "@/features/lab/types";
import { ensureFolderPath, listFilesInFolder, readDriveJson, lerJsonsListados, deleteDriveFile, findFileInFolder, atualizarDriveJson, DRIVE_ROOT_FOLDER_ID, type ArquivoListado } from "@/lib/driveStorage";
import { aplicarSync, arvoreDoCache, cacheVazio, type Arvore, type LinhaAmostra, type LinhaEnsaio, type LinhaOS, type LinhaSync, type RespostaSync } from "@/features/lab/arvore";

export type SerializableJson = string | number | boolean | null | SerializableJson[] | { [key: string]: SerializableJson };
export function toSerializableJson(value: unknown): SerializableJson | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as SerializableJson;
  } catch {
    return undefined;
  }
}

type OSFile = {
  id: string;
  numero: string;
  client: string | null;
  workNumber: string | null;
  local: string | null;
  operator: string | null;
  technicalResp: string | null;
  revision: string | null;
  createdAt: string;
  updatedAt: string;
  rev: number;
};

type AmostraFile = {
  id: string;
  osId: string;
  reportNumber: string | null;
  borehole: string | null;
  depth: string | null;
  description: string | null;
  granulometricDescription: string | null;
  code: string | null;
  sampleType: string | null;
  materialType: string | null;
  coords: Coords | null;
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
  rev: number;
};

export type ApprovalEvent = {
  action: string;
  comment?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  createdAt: string;
};

export type ReportApprovalRow = {
  id: string;
  scope_id: string;
  rev: number;
  status: string;
  requested_by: string;
  requested_by_name: string | null;
  requested_at: string;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  verification_comment: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  comment: string | null;
  filename: string | null;
  updated_at?: string;
};

export type ReportApprovalCommentRow = {
  id: string;
  scope_id: string;
  rev: number;
  action: string;
  comment: string | null;
  author_id: string;
  author_name: string | null;
  author_role: string | null;
  created_at: string;
};

export type DraftHistoryEntry = {
  changedAt: string;
  changedBy?: string | null;
  changedByName?: string | null;
  diff: Record<string, { de: SerializableJson; para: SerializableJson }>;
};

export type EnsaioFile = {
  id: string;
  amostraId: string;
  tipo: string;
  status: string | null;
  label: string | null;
  nome: string | null;
  sigla: string | null;
  operator: string | null;
  photos: Photo[];
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  rev: number;
  // Contador de concorrência dedicado ao rascunho (payload), separado do
  // rev geral acima — que também é incrementado por fotos/status/aprovações
  // via upsertEnsaioFn. Sem essa separação, uma gravação de foto podia fazer
  // o próximo autosave do rascunho reportar "alterado em outro computador"
  // mesmo sem nenhum outro usuário/aba envolvido. Ver draft.functions.ts.
  draftRev?: number;
  // Consolidado aqui: farol/aprovações/histórico do mesmo ensaio (ver
  // draft.functions.ts e approvals.functions.ts). upsertEnsaioFn (chamado
  // pelo labStore a cada patchEnsaio/onPayloadChange) preserva esses campos
  // via merge com o arquivo existente — nunca os sobrescreve às cegas.
  workflowStatus?: string;
  approvals?: ApprovalEvent[];
  draftHistory?: DraftHistoryEntry[];
  reportApprovals?: ReportApprovalRow[];
  approvalComments?: ReportApprovalCommentRow[];
};

export const FOLDER_OS = ["lab-os"];
export const FOLDER_AMOSTRAS = ["lab-amostras"];
export const FOLDER_ENSAIOS = ["lab-ensaios"];

export const osFileName = (id: string) => `${id}.json`;
export const amostraFileName = (osId: string, id: string) => `${osId}__${id}.json`;
export const ensaioFileName = (amostraId: string, id: string) => `${amostraId}__${id}.json`;

function osToPublic(f: OSFile): Omit<OS, "amostras"> {
  return {
    id: f.id,
    numero: f.numero,
    client: f.client ?? undefined,
    workNumber: f.workNumber ?? undefined,
    local: f.local ?? undefined,
    operator: f.operator ?? undefined,
    technicalResp: f.technicalResp ?? undefined,
    revision: f.revision ?? undefined,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function amostraToPublic(f: AmostraFile): Omit<Amostra, "ensaios"> {
  return {
    id: f.id,
    reportNumber: f.reportNumber ?? undefined,
    borehole: f.borehole ?? undefined,
    depth: f.depth ?? undefined,
    description: f.description ?? undefined,
    granulometricDescription: f.granulometricDescription ?? undefined,
    code: f.code ?? undefined,
    sampleType: f.sampleType ?? undefined,
    materialType: f.materialType ?? undefined,
    coords: f.coords ?? undefined,
    photos: f.photos ?? [],
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

type SerializableEnsaio = Omit<Ensaio, "payload"> & { payload?: SerializableJson };

/**
 * Deriva o status "oficial" (visto pelo Kanban/Central de Relatórios/
 * labStore) a partir do histórico de aprovações por revisão
 * (`reportApprovals`) em vez de confiar no campo `status` gravado
 * separadamente. Os dois já saíram de sincronia mais de uma vez porque
 * cada caminho de escrita (requestApproval/verifyApproval/decideApproval)
 * precisava lembrar de gravar AMBOS os campos juntos — esquecer um deles
 * deixava um ensaio já aprovado aparecendo pra sempre com o status
 * antigo. `reportApprovals` em si nunca teve esse problema (sempre foi
 * corretamente atualizado por todos os caminhos), então derivar dali
 * também corrige retroativamente ensaios já aprovados antes deste fix,
 * sem precisar de nenhuma migração.
 */
function deriveEnsaioStatus(f: EnsaioFile): EnsaioStatus {
  const approvals = (f.reportApprovals as ReportApprovalRow[] | undefined) ?? [];
  if (approvals.length === 0) return (f.status as EnsaioStatus) || "rascunho";
  const latest = approvals.reduce((a, b) => (b.rev > a.rev ? b : a));
  switch (latest.status) {
    case "aprovado":
      return "aprovado";
    case "pendente_aprovacao":
    case "verificado":
      return "aguardando_aprovacao";
    case "pendente_verificacao":
    case "rejeitado_verificacao":
    case "rejeitado":
      return "aguardando_verificacao";
    default:
      return (f.status as EnsaioStatus) || "rascunho";
  }
}

/**
 * Fotos guardam a imagem inteira em base64 dentro de `dataUrl` — cada uma
 * pode passar de 1 MB. `loadLabTree` carrega TODOS os ensaios do
 * laboratório de uma vez (todo carregamento de página); embutir o
 * conteúdo de cada foto nessa resposta é o maior contribuinte pro erro
 * "Worker exceeded resource limits" (Cloudflare 1102) — o próprio arquivo
 * fica grande de sobra pra ler/serializar em massa. O bulk load só
 * precisa saber QUANTAS fotos existem (pra badges/contadores); o
 * conteúdo de verdade é buscado sob demanda, só para o ensaio realmente
 * aberto, via getLabEnsaioSnapshot (leitura direta O(1), sem varrer
 * pasta nenhuma — não passa por aqui).
 */
function photoToLightweight(p: Photo): Photo {
  return { ...p, dataUrl: "" };
}

function ensaioToPublic(f: EnsaioFile): SerializableEnsaio {
  return {
    id: f.id,
    tipo: f.tipo as EnsaioTipo,
    status: deriveEnsaioStatus(f),
    label: f.label ?? undefined,
    nome: f.nome ?? undefined,
    sigla: f.sigla ?? undefined,
    operator: f.operator ?? undefined,
    photos: (f.photos ?? []).map(photoToLightweight),
    payload: toSerializableJson(f.payload),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function linhaSync<T>(arquivo: ArquivoListado, dados: T): LinhaSync<T> {
  return { fileId: arquivo.id, version: arquivo.version ?? null, dados };
}

/**
 * Lista as três pastas da árvore do laboratório e lê só os arquivos que o
 * cliente ainda não tem na versão atual (`conhecidos`: fileId → version). O
 * cliente monta a árvore com `aplicarSync` + `arvoreDoCache`
 * (features/lab/arvore.ts).
 *
 * Antes, cada atualização — a cada 8s, por aba, e uma vez para cada componente
 * que usava o labStore — baixava TODOS os ~215 arquivos e devolvia a árvore
 * inteira, com os payloads e suas fotos em base64. Agora, sem mudança, custa 3
 * listagens no Drive e devolve só ids.
 */
export async function montarRespostaSync(conhecidos: Record<string, string>): Promise<RespostaSync> {
  const listar = async (partes: string[]) => listFilesInFolder(await ensureFolderPath(partes));
  const [osArqs, amArqs, enArqs] = await Promise.all([listar(FOLDER_OS), listar(FOLDER_AMOSTRAS), listar(FOLDER_ENSAIOS)]);

  // Sem `version` (modo offline), não há como saber: vai sempre.
  const mudou = (a: ArquivoListado) => !a.version || conhecidos[a.id] !== a.version;
  const [osLidos, amLidos, enLidos] = await Promise.all([
    lerJsonsListados<OSFile>(osArqs.filter(mudou)),
    lerJsonsListados<AmostraFile>(amArqs.filter(mudou)),
    lerJsonsListados<EnsaioFile>(enArqs.filter(mudou)),
  ]);

  return {
    os: osLidos.map(({ arquivo, data }) => linhaSync<LinhaOS>(arquivo, osToPublic(data))),
    amostras: amLidos.map(({ arquivo, data }) =>
      linhaSync<LinhaAmostra>(arquivo, { ...amostraToPublic(data), osId: data.osId }),
    ),
    ensaios: enLidos.map(({ arquivo, data }) =>
      linhaSync<LinhaEnsaio>(arquivo, { ...ensaioToPublic(data), amostraId: data.amostraId }),
    ),
    ordem: { os: osArqs.map((a) => a.id), amostras: amArqs.map((a) => a.id), ensaios: enArqs.map((a) => a.id) },
  };
}

const SyncInput = z.object({ conhecidos: z.record(z.string()).optional() });

/** Árvore incremental: só o que mudou desde `conhecidos` — ver `montarRespostaSync`. */
export const syncLabTree = createServerFn({ method: "POST" })
  .validator((v: unknown) => SyncInput.parse(v ?? {}))
  .handler(async ({ data }): Promise<RespostaSync> => montarRespostaSync(data.conhecidos ?? {}));

/** Árvore inteira de uma vez. Mantida por compatibilidade; o labStore usa `syncLabTree`. */
export const loadLabTree = createServerFn({ method: "GET" }).handler(async (): Promise<{ state: Arvore | null }> => {
  const resp = await montarRespostaSync({});
  if (resp.ordem.os.length === 0) {
    return { state: null };
  }
  return { state: arvoreDoCache(aplicarSync(cacheVazio(), resp).cache) };
});

/* ─────────────────────────────── OS ─────────────────────────────── */

const OSInput = z.object({
  id: z.string().min(1),
  numero: z.string(),
  client: z.string().optional(),
  workNumber: z.string().optional(),
  local: z.string().optional(),
  operator: z.string().optional(),
  technicalResp: z.string().optional(),
  revision: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertOSFn = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => OSInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_OS);
    const name = osFileName(data.id);
    // Ver upsertEnsaioFn: leitura e escrita no mesmo lock.
    await atualizarDriveJson<OSFile>(name, folderId, (existing) => {
      const nextRev = (existing?.rev ?? 0) + 1;
      const file: OSFile = {
        id: data.id,
        numero: data.numero,
        client: data.client ?? null,
        workNumber: data.workNumber ?? null,
        local: data.local ?? null,
        operator: data.operator ?? null,
        technicalResp: data.technicalResp ?? null,
        revision: data.revision ?? null,
        createdAt: existing?.createdAt ?? data.createdAt,
        updatedAt: data.updatedAt,
        rev: nextRev,
      };
      return mudaAlgo(existing, file) ? file : null;
    });
    return { ok: true };
  });

const DeleteOSInput = z.object({ id: z.string().min(1) });
export const deleteOSFn = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => DeleteOSInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_OS);
    const fileId = await findFileInFolder(osFileName(data.id), folderId);
    if (fileId) await deleteDriveFile(fileId);
    return { ok: true };
  });

/* ─────────────────────────────── Amostra ─────────────────────────────── */

const AmostraInput = z.object({
  id: z.string().min(1),
  osId: z.string().min(1),
  reportNumber: z.string().optional(),
  borehole: z.string().optional(),
  depth: z.string().optional(),
  description: z.string().optional(),
  granulometricDescription: z.string().optional(),
  code: z.string().optional(),
  sampleType: z.string().optional(),
  materialType: z.string().optional(),
  coords: z.record(z.unknown()).nullable().optional(),
  photos: z.array(z.record(z.unknown())).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertAmostraFn = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => AmostraInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_AMOSTRAS);
    const name = amostraFileName(data.osId, data.id);
    // Ver upsertEnsaioFn: leitura e escrita no mesmo lock.
    await atualizarDriveJson<AmostraFile>(name, folderId, (existing) => {
      const nextRev = (existing?.rev ?? 0) + 1;
      const file: AmostraFile = {
        id: data.id,
        osId: data.osId,
        reportNumber: data.reportNumber ?? null,
        borehole: data.borehole ?? null,
        depth: data.depth ?? null,
        description: data.description ?? null,
        granulometricDescription: data.granulometricDescription ?? null,
        code: data.code ?? null,
        sampleType: data.sampleType ?? null,
        materialType: data.materialType ?? null,
        // Campo omitido pelo cliente não significa "apagar": antes, uma gravação
        // sem `photos`/`coords` zerava as fotos e as coordenadas da amostra.
        coords: (data.coords !== undefined ? data.coords : (existing?.coords ?? null)) as Coords | null,
        photos: (data.photos ?? existing?.photos ?? []) as unknown as Photo[],
        createdAt: existing?.createdAt ?? data.createdAt,
        updatedAt: data.updatedAt,
        rev: nextRev,
      };
      return mudaAlgo(existing, file) ? file : null;
    });
    return { ok: true };
  });

const DeleteAmostraInput = z.object({ id: z.string().min(1), osId: z.string().min(1) });
export const deleteAmostraFn = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => DeleteAmostraInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_AMOSTRAS);
    const fileId = await findFileInFolder(amostraFileName(data.osId, data.id), folderId);
    if (fileId) await deleteDriveFile(fileId);
    return { ok: true };
  });

/* ─────────────────────────────── Ensaio ─────────────────────────────── */

const EnsaioInput = z.object({
  id: z.string().min(1),
  amostraId: z.string().min(1),
  tipo: z.string(),
  status: z.string().optional(),
  label: z.string().optional(),
  nome: z.string().optional(),
  sigla: z.string().optional(),
  operator: z.string().optional(),
  photos: z.array(z.record(z.unknown())).optional(),
  payload: z.unknown().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * A gravação mudaria o arquivo além de `rev`/`updatedAt`? Sem mudança real, não
 * grava: cada gravação é um ciclo completo no Drive (ler, enviar) e sobe a
 * `version` do arquivo, o que obriga todas as abas abertas a baixá-lo de novo.
 */
export function mudaAlgo<T extends object>(existente: T | null, proximo: T): boolean {
  if (!existente) return true;
  const semControle = (o: T) => {
    const copia: Record<string, unknown> = { ...(o as Record<string, unknown>) };
    delete copia.rev;
    delete copia.updatedAt;
    return JSON.stringify(copia);
  };
  return semControle(existente) !== semControle(proximo);
}

/**
 * O carregamento em massa entrega as fotos sem o conteúdo (`dataUrl: ""`, ver
 * `photoToLightweight`), e o labStore devolve essas fotos "leves" em toda
 * gravação do ensaio — inclusive numa simples troca de status feita na Central
 * de Relatórios, sem o editor aberto. Foto antiga, que só existe em `dataUrl`
 * (sem `url` de arquivo no Drive), perdia a imagem nessa gravação. Aqui, foto
 * que chega sem conteúdo nenhum mantém o `dataUrl` que o arquivo já tinha para
 * o mesmo id. Foto removida pelo cliente continua removida.
 */
export function preservarConteudoDasFotos(recebidas: Photo[], existentes: Photo[] | null | undefined): Photo[] {
  if (!existentes?.length) return recebidas;
  const porId = new Map(existentes.map((p) => [p.id, p]));
  return recebidas.map((p) => {
    if (p.dataUrl || p.url) return p;
    const antiga = porId.get(p.id);
    return antiga?.dataUrl ? { ...p, dataUrl: antiga.dataUrl } : p;
  });
}

/**
 * Mescla uma gravação vinda do labStore com o arquivo de ensaio existente.
 * Preserva workflowStatus/approvals/draftHistory (geridos por
 * draft.functions.ts/approvals.functions.ts) e nunca apaga por omissão.
 *
 * O `payload` só é aceito por aqui enquanto o ensaio NÃO tem rascunho
 * compartilhado (`draftRev`). Os editores gravam o payload por dois caminhos:
 * `saveSharedDraft`, com trava de revisão, e `ctx.onPayloadChange` → labStore →
 * aqui, sem trava nenhuma. Se a tela abrisse com o formulário vazio (leitura
 * remota falhou), este segundo caminho gravava o vazio por cima do rascunho
 * real, contornando a trava do primeiro. Havendo `draftRev`, o rascunho é o
 * dono do payload.
 */
export function mesclarEnsaio(existing: EnsaioFile | null, data: z.infer<typeof EnsaioInput>): EnsaioFile {
  const temRascunhoCompartilhado = typeof existing?.draftRev === "number";
  return {
    ...(existing ?? ({} as EnsaioFile)),
    id: data.id,
    amostraId: data.amostraId,
    tipo: data.tipo,
    status: data.status ?? existing?.status ?? null,
    label: data.label ?? existing?.label ?? null,
    nome: data.nome ?? existing?.nome ?? null,
    sigla: data.sigla ?? existing?.sigla ?? null,
    operator: data.operator ?? existing?.operator ?? null,
    photos: data.photos
      ? preservarConteudoDasFotos(data.photos as unknown as Photo[], existing?.photos)
      : (existing?.photos ?? []),
    payload:
      data.payload !== undefined && !temRascunhoCompartilhado ? data.payload : (existing?.payload ?? null),
    createdAt: existing?.createdAt ?? data.createdAt,
    updatedAt: data.updatedAt,
    rev: (existing?.rev ?? 0) + 1,
  };
}

export const upsertEnsaioFn = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => EnsaioInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
    const name = ensaioFileName(data.amostraId, data.id);
    // A leitura precisa estar DENTRO do lock, junto com a escrita. Antes, só o
    // upload era serializado: duas gravações seguidas liam o mesmo `existing`,
    // e a segunda regravava por cima o que a primeira tinha acabado de salvar
    // (ex.: uma aprovação gravada entre a leitura e a escrita de um autosave).
    //
    // Gravação que não muda nada não vai ao Drive — ex.: o payload de um ensaio
    // com rascunho compartilhado, que mesclarEnsaio ignora. Era uma segunda
    // gravação completa do mesmo arquivo a cada autosave do editor.
    await atualizarDriveJson<EnsaioFile>(name, folderId, (existing) => {
      const proximo = mesclarEnsaio(existing, data);
      return mudaAlgo(existing, proximo) ? proximo : null;
    });
    return { ok: true };
  });

const DeleteEnsaioInput = z.object({ id: z.string().min(1), amostraId: z.string().min(1) });
export const deleteEnsaioFn = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => DeleteEnsaioInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
    const fileId = await findFileInFolder(ensaioFileName(data.amostraId, data.id), folderId);
    if (fileId) await deleteDriveFile(fileId);
    return { ok: true };
  });
