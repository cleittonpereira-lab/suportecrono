import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchCadastroOs } from "@/lib/cadastro.functions";
import { SHEETS_QUERY_CONFIG } from "./sheets-query-config";

export function useCadastroOs() {
  const fn = useServerFn(fetchCadastroOs);
  return useQuery({
    queryKey: ["cadastro-os"],
    queryFn: fn,
    ...SHEETS_QUERY_CONFIG,
  });
}