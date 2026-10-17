import type { HandOutFilter } from "@/features/stock/services/handouts";
import { DIVISIONS, SERVICE_TYPES, STOCK_KINDS, type StockKind } from "@/features/stock/validators/option-codes";
import { useSearchParams } from "@/lib/compat/navigation";

export const ALL = "ALL";

/** The filters his page draws, read from the address: the side, then «نوع الخدمة», then the division. */
export function useHandoutFilter(): HandOutFilter & { kind: StockKind } {
  const params = useSearchParams();
  const pick = <T extends string>(codes: readonly T[], value: string | null): T | null =>
    value !== null && (codes as readonly string[]).includes(value) ? (value as T) : null;
  return {
    kind: pick(STOCK_KINDS, params.get("kind")) ?? STOCK_KINDS[0],
    serviceType: pick(SERVICE_TYPES, params.get("service")),
    division: pick(DIVISIONS, params.get("division")),
  };
}
