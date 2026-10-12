import { Skeleton } from "@/components/ui/skeleton";

/**
 * What a money screen shows while its figures load: the academy's finance
 * page does the same, because an aggregate over a period is the slowest read
 * in the program and an empty page that long looks like a failure.
 */
export function ScreenSkeleton({ tiles = true }: { tiles?: boolean }) {
  return (
    <div className="space-y-5">
      <Skeleton className="h-14 w-full max-w-md" />
      {tiles && (
        <div className="grid gap-5 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
