import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";
import { SECTION_ACCENT, type SectionId } from "@/navigation/sections";

import { ALL, divisionSearch } from "./division-param";

/**
 * The switch between the divisions of a money screen: «الكل» then his four
 * lines (and «عام» for expenses).
 *
 * The academy's finance views are segmented tabs in the section's hue
 * (finance/_components/finance-tabs.tsx); here the choice is kept in the
 * address, like the period, so a tile above can open its division and a reload
 * keeps it.
 */
export function DivisionTabs<T extends string>({
  section,
  value,
  options,
  labelOf,
  ariaLabel,
  children,
}: {
  section: SectionId;
  value: T | typeof ALL;
  options: readonly T[];
  labelOf: (option: T | typeof ALL) => string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const accent = SECTION_ACCENT[section];

  return (
    <Tabs value={value} onValueChange={(next) => router.replace(`?${divisionSearch(search, next)}`)}>
      {/* Six views do not always fit one line: the strip wraps, as the academy's does. */}
      <TabsList variant="segmented" className="w-full" aria-label={ariaLabel}>
        {[ALL, ...options].map((option) => (
          <TabsTrigger key={option} value={option} className={accent.tabSegment}>
            {labelOf(option as T | typeof ALL)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={value} className="space-y-5 pt-4">
        {children}
      </TabsContent>
    </Tabs>
  );
}
