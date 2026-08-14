import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchEntregues } from "@/lib/sheets.functions";
import { SHEETS_QUERY_CONFIG } from "./sheets-query-config";

export function useEntregues() {
  const fn = useServerFn(fetchEntregues);
  return useQuery({
    queryKey: ["entregues"],
    queryFn: fn,
    ...SHEETS_QUERY_CONFIG,
  });
}