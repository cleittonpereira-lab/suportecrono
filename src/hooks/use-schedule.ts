import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchSchedule } from "@/lib/sheets.functions";
import { SHEETS_QUERY_CONFIG } from "./sheets-query-config";

export function useSchedule() {
  const fetchScheduleFn = useServerFn(fetchSchedule);
  return useQuery({
    queryKey: ["schedule"],
    queryFn: fetchScheduleFn,
    ...SHEETS_QUERY_CONFIG,
  });
}