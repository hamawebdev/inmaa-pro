import { queryClient } from "@/lib/query-client";

/**
 * Stand-in for next/cache's `revalidatePath`.
 *
 * The web app calls this at the end of ~111 mutations. Rather than rewrite each
 * one into a bespoke invalidation, we keep the signature and translate the path
 * into a hierarchical query key: "/dashboard/students/abc" becomes
 * ["dashboard", "students", "abc"].
 *
 * TanStack Query matches keys by prefix, so invalidating ["dashboard","students"]
 * also refetches ["dashboard","students","abc"] and any other descendant. Page
 * queries must therefore be keyed by their route path — use `pathKey()`.
 */
export function revalidatePath(path: string, _type?: "page" | "layout"): void {
  void queryClient.invalidateQueries({ queryKey: pathKey(path) });
}

/**
 * Build the query key for a route path. Pages use this so that the mutations'
 * `revalidatePath` calls reach them.
 *
 *   useQuery({ queryKey: pathKey("/dashboard/students"), queryFn: ... })
 */
export function pathKey(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** `revalidateTag` has no route to map onto; treat the tag as its own key. */
export function revalidateTag(tag: string): void {
  void queryClient.invalidateQueries({ queryKey: [tag] });
}
