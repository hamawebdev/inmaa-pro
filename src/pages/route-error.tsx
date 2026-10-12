import { useEffect } from "react";

import { useRouteError } from "react-router-dom";
import { useTranslations } from "use-intl";

import { useErrorMessage } from "@/i18n/errors";
import { isNotFoundSignal, isRedirectSignal } from "@/lib/compat/navigation";

import DashboardNotFound from "./not-found";

/**
 * Route-level error element. Absorbs the control-flow signals thrown by the
 * `notFound()` / `redirect()` shims so they behave like their Next.js
 * counterparts, and shows a real error for anything else.
 *
 * The error's own text is almost always an English runtime message, so it goes
 * to the console for whoever is debugging, and the screen shows the translated
 * sentence for it — or a general one when there is none.
 */
export default function RouteError() {
  const error = useRouteError();
  const t = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const isSignal = isNotFoundSignal(error) || isRedirectSignal(error);

  useEffect(() => {
    if (!isSignal) console.error(error);
  }, [error, isSignal]);

  if (isNotFoundSignal(error)) return <DashboardNotFound />;

  // redirect() already scheduled the navigation; render nothing while it lands.
  if (isRedirectSignal(error)) return null;

  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex h-full flex-col items-center justify-center space-y-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t("SomethingWentWrong")}</h1>
      <p className="max-w-lg text-sm break-words text-muted-foreground">{errorMessage(message, t("CouldNotLoad"))}</p>
    </div>
  );
}
