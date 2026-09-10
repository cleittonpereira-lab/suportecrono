/**
 * Fusão do snapshot do servidor com o estado local do labStore.
 *
 * Separado de `store.ts` para poder ser testado sem React nem server functions:
 * `dirtyIds` (entidades com gravação pendente/em voo) entra como parâmetro em
 * vez de ser lido do módulo.
 */
import type { LabState } from "./types";

/**
 * Por quanto tempo uma entidade criada nesta tela continua valendo mesmo sem
 * aparecer no snapshot do servidor. O Drive não é fortemente consistente: um
 * arquivo recém-gravado pode demorar a aparecer na listagem. Antes, uma
 * entidade que já tinha terminado de salvar (saído de `dirtyIds`) mas ainda não
 * aparecia na listagem era REMOVIDA da tela no refresh seguinte (a cada 8s) — o
 * ensaio recém-criado piscava e sumia.
 */
export const JANELA_CONSISTENCIA_MS = 2 * 60_000;

type ComDatas = { id: string; createdAt: string; updatedAt: string };

/**
 * O Drive não é fortemente consistente logo após uma gravação — a leitura pode
 * devolver a versão anterior do arquivo por alguns segundos mesmo depois do
 * `writeDriveJson` ter retornado e o `clearDirty` já ter rodado. Comparar
 * `updatedAt` impede que essa leitura atrasada sobrescreva uma edição local
 * recém-salva (foto ou texto), mesmo fora de `dirtyIds`.
 */
export function isLocalNewer(local: { updatedAt: string } | undefined, remote: { updatedAt: string }): boolean {
  if (!local) return false;
  const l = Date.parse(local.updatedAt);
  const r = Date.parse(remote.updatedAt);
  // Compara como instante, não como texto: com fuso ("-03:00") ou sem "Z", a
  // comparação de strings dava o resultado errado.
  if (Number.isFinite(l) && Number.isFinite(r)) return l > r;
  return local.updatedAt > remote.updatedAt;
}

/**
 * Reaproveita a referência local quando o conteúdo é idêntico ao que veio do
 * servidor. Sem isso, cada refresh trocava toda entidade "limpa" por um objeto
 * novo, e os efeitos que dependem da identidade desses objetos (ex.: autosave
 * do rascunho) disparavam gravações repetidas sem edição nenhuma.
 */
export function reuseIfUnchanged<T>(local: T | undefined, remote: T): T {
  if (local !== undefined && JSON.stringify(local) === JSON.stringify(remote)) return local;
  return remote;
}

/** Entidade que só existe localmente deve ser mantida? */
function manterSoLocal(e: ComDatas, dirtyIds: ReadonlySet<string>, agora: number): boolean {
  if (dirtyIds.has(e.id)) return true;
  const criadaEm = Date.parse(e.createdAt);
  return Number.isFinite(criadaEm) && agora - criadaEm < JANELA_CONSISTENCIA_MS;
}

/**
 * Funde o snapshot do servidor com o estado local, preservando entidades com
 * escrita pendente/em voo, mais recentes que o snapshot, ou criadas há pouco e
 * ainda não visíveis no servidor.
 */
export function mergeRemote(
  local: LabState,
  remote: LabState,
  dirtyIds: ReadonlySet<string>,
  agora: number = Date.now(),
): LabState {
  const localOSMap = new Map(local.os.map((o) => [o.id, o]));
  const remoteOSIds = new Set(remote.os.map((o) => o.id));

  const mergedOS = remote.os.map((remoteO) => {
    const localO = localOSMap.get(remoteO.id);
    const osIsDirty = dirtyIds.has(remoteO.id) || isLocalNewer(localO, remoteO);
    const baseOS = osIsDirty && localO ? localO : remoteO;

    const localAmMap = new Map((localO?.amostras ?? []).map((a) => [a.id, a]));
    const remoteAmIds = new Set(remoteO.amostras.map((a) => a.id));

    const mergedAmostras = remoteO.amostras.map((remoteA) => {
      const localA = localAmMap.get(remoteA.id);
      const amIsDirty = dirtyIds.has(remoteA.id) || isLocalNewer(localA, remoteA);
      const baseAm = amIsDirty && localA ? localA : remoteA;

      const localEnMap = new Map((localA?.ensaios ?? []).map((e) => [e.id, e]));
      const remoteEnIds = new Set(remoteA.ensaios.map((e) => e.id));

      const mergedEnsaios = remoteA.ensaios.map((remoteE) => {
        const localE = localEnMap.get(remoteE.id);
        if ((dirtyIds.has(remoteE.id) || isLocalNewer(localE, remoteE)) && localE) return localE;
        return reuseIfUnchanged(localE, remoteE);
      });
      const localOnlyEnsaios = (localA?.ensaios ?? []).filter(
        (e) => !remoteEnIds.has(e.id) && manterSoLocal(e, dirtyIds, agora),
      );

      const mergedAmostra = { ...baseAm, ensaios: [...mergedEnsaios, ...localOnlyEnsaios] };
      return reuseIfUnchanged(localA, mergedAmostra);
    });
    const localOnlyAmostras = (localO?.amostras ?? []).filter(
      (a) => !remoteAmIds.has(a.id) && manterSoLocal(a, dirtyIds, agora),
    );

    const mergedOSEntry = { ...baseOS, amostras: [...mergedAmostras, ...localOnlyAmostras] };
    return reuseIfUnchanged(localO, mergedOSEntry);
  });

  const localOnlyOS = local.os.filter((o) => !remoteOSIds.has(o.id) && manterSoLocal(o, dirtyIds, agora));
  return { os: [...mergedOS, ...localOnlyOS] };
}
