import type * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface Figure {
  label: string;
  /** A count as text, or an amount as `<MoneyValue />`: neither is ever cut. */
  value: React.ReactNode;
  /** Muted: a figure shown beside the main ones, never added to them. */
  muted?: boolean;
}

/** Columns on a wide window, by number of figures: Tailwind needs each class written out. */
const WIDE_COLUMNS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/** The figures of the division being looked at, in a row above its chart. */
export function FigureStrip({ figures }: { figures: readonly Figure[] }) {
  return (
    <Card size="sm">
      <CardContent>
        <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-3", WIDE_COLUMNS[figures.length] ?? "lg:grid-cols-4")}>
          {figures.map((figure) => (
            <div key={figure.label} className="min-w-0">
              <dt className="truncate text-sm text-muted-foreground">{figure.label}</dt>
              <dd
                className={cn(
                  "text-xl font-bold break-words tabular-nums tall:text-2xl",
                  figure.muted && "text-muted-foreground",
                )}
              >
                {figure.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
