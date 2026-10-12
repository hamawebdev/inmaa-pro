import type { createHashRouter } from "react-router-dom";

type Router = ReturnType<typeof createHashRouter>;

let router: Router | null = null;

/** Called once from main.tsx after the router is created. */
export function registerRouter(instance: Router) {
  router = instance;
}

/**
 * Imperative navigation for code that runs outside a component (the `redirect`
 * shim). Inside components, prefer the `useRouter` shim.
 */
export function getRouter(): Router {
  if (!router) throw new Error("Router accessed before registerRouter() ran.");
  return router;
}
