import { useQuery } from "@tanstack/react-query";

import { BRANCHES_PATH, listBranchesQuery, type BranchRow } from "@/features/core/services/branches";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The centre's branches (feature 47), the main one first. `several` is false
 * while there is only one active branch: a screen then shows no branch field
 * or filter at all.
 */
export function useBranches(): { branches: BranchRow[]; active: BranchRow[]; several: boolean; isPending: boolean } {
  const query = useQuery({
    queryKey: [...pathKey(BRANCHES_PATH), "branches"],
    queryFn: () => listBranchesQuery(undefined),
  });
  const branches = query.data ?? [];
  const active = branches.filter((branch) => branch.isActive);
  return { branches, active, several: active.length > 1, isPending: query.isPending };
}
