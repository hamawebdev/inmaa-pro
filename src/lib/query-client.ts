import { QueryClient } from "@tanstack/react-query";

/**
 * Exported as a module singleton (rather than created inside main.tsx) so the
 * `revalidatePath` shim can reach it from non-React code — the ported server
 * actions call it directly, exactly as they did in the web app.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local SQLite: reads are cheap and always fresh enough to serve, but
      // there is no other client mutating the file, so nothing expires on its
      // own. Invalidation is explicit, via revalidatePath().
      staleTime: Infinity,
      gcTime: 30 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Cache policy for the read-only aggregate views: the academy dashboard, its
 * three payment-status reports, and the finance analytics page.
 *
 * These are not backed by one table. They are derived from payments,
 * attendance, students, groups, expenses, payouts and debt ledgers all at once,
 * so no single `revalidatePath` key covers them and any mutation that forgets
 * one would leave them silently showing yesterday's numbers.
 *
 * In the web app they were `async` server components, which Next re-rendered on
 * every navigation. `staleTime: 0` reproduces exactly that: the cached figures
 * paint immediately and a refetch runs on mount, so opening the page always
 * settles on current data no matter which mutation ran. Spread this into the
 * `useQuery` call — do not make it the global default, since the list views
 * genuinely want explicit invalidation.
 */
export const AGGREGATE_QUERY_OPTIONS = { staleTime: 0 } as const;
