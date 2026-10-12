import * as React from "react";

import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

import { getRouter } from "./router-instance";

/**
 * Stand-ins for the Next.js navigation APIs the ported pages use, backed by
 * react-router. Keeping the shapes identical means the ~45 call sites carried
 * over from the web app only change their import path.
 */

export type LinkProps = Omit<React.ComponentProps<"a">, "href"> & {
  href: string;
  replace?: boolean;
  /** Accepted and ignored — Next-only concepts with no react-router analogue. */
  prefetch?: boolean;
  scroll?: boolean;
};

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, prefetch: _prefetch, scroll: _scroll, ...props },
  ref,
) {
  return <RouterLink ref={ref} to={href} replace={replace} {...props} />;
});

export type AppRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  /**
   * In Next this refetched the server component tree. Here the data lives in
   * TanStack Query, so refreshing means invalidating every query — the same
   * observable effect for the call sites that use it.
   */
  refresh: () => void;
  prefetch: (href: string) => void;
};

export function useRouter(): AppRouter {
  const navigate = useNavigate();

  return React.useMemo<AppRouter>(
    () => ({
      push: (href) => void navigate(href),
      replace: (href) => void navigate(href, { replace: true }),
      back: () => void navigate(-1),
      forward: () => void navigate(1),
      refresh: () => {
        // Imported lazily to keep this module free of a query-client cycle.
        void import("@/lib/query-client").then(({ queryClient }) => queryClient.invalidateQueries());
      },
      prefetch: () => undefined,
    }),
    [navigate],
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}

/**
 * Next's `redirect()` throws to unwind the render. We keep that contract: the
 * navigation is scheduled and the throw stops the caller from rendering with
 * data it already decided is unusable. Route error elements swallow it.
 */
export class RedirectSignal extends Error {
  constructor(public readonly href: string) {
    super(`Redirect to ${href}`);
    this.name = "RedirectSignal";
  }
}

export function redirect(href: string): never {
  void getRouter().navigate(href, { replace: true });
  throw new RedirectSignal(href);
}

/** Thrown by `notFound()`; rendered as the 404 page by the route error element. */
export class NotFoundSignal extends Error {
  constructor() {
    super("Not found");
    this.name = "NotFoundSignal";
  }
}

export function notFound(): never {
  throw new NotFoundSignal();
}

export function isNotFoundSignal(error: unknown): error is NotFoundSignal {
  return error instanceof NotFoundSignal;
}

export function isRedirectSignal(error: unknown): error is RedirectSignal {
  return error instanceof RedirectSignal;
}
