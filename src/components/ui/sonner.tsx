import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/**
 * Toasts, sized for the same reader as the rest of the app.
 *
 * `richColors` binds each severity to the app's own semantic tokens rather than
 * sonner's defaults, so a success toast is the same green as a success button.
 * The duration is long by web standards on purpose: this is a desktop tool where
 * a scan or a save may complete while the user is looking at a paper form, and a
 * 3-second toast is a message they never received.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  // The web app read this from next-themes, which had no provider mounted and
  // so always reported "system". Read the store that actually drives the theme.
  const theme = usePreferencesStore((s) => s.resolvedThemeMode);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      richColors
      duration={4500}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border-strong)",
          "--border-radius": "var(--radius)",
          "--width": "24rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast border-app text-base shadow-lg",
          title: "font-bold tracking-tight",
          description: "text-base text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
