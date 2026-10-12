import { useTranslations } from "use-intl";

import { Screen, ScreenHeader, SectionHeading } from "@/components/screen";
import { sectionLevel } from "@/lib/access/session";
import { useSession } from "@/hooks/use-session";
import { loadHomeSlots } from "@/lib/home/slots";
import { getSection } from "@/navigation/sections";

import { AlertTiles } from "./_components/alert-tiles";
import { HomeDayBoard } from "./_components/home-day-board";
import { TodayTiles } from "./_components/today-tiles";

/**
 * The home screen: what today holds, what needs attention, and the day board.
 *
 * Closest academy screen: the overview (pages/dashboard/academy/page.tsx): a
 * header, then headed rows of tiles, each tile the way in to the list behind
 * it; no tab strip.
 *
 * Three places. Today's tiles and the day board are Operations' to fill
 * (`homeSlots` in src/features/operations/home.tsx, see src/lib/home/slots.ts);
 * until it does, the defaults beside this file draw them from Operations' own
 * board. The alert tiles come from the alert registry (src/lib/alerts): each
 * alert's rule is its owner's, and its tile opens its owner's filtered list.
 */
/** What the folders gave for the home screen. Read once: a folder's `home.tsx` is part of the program, not of a render. */
const SLOTS = loadHomeSlots();

export default function HomePage() {
  const t = useTranslations("Home");
  const tNav = useTranslations("Nav");
  const session = useSession();
  const Today = SLOTS.today ?? TodayTiles;
  const Board = SLOTS.board ?? HomeDayBoard;
  // The visits are in «طلبات الخدمة»: a role that cannot open it sees no day here.
  const seesVisits = session ? sectionLevel(session, "REQUESTS") !== null : false;

  return (
    <Screen className="space-y-8 tall:space-y-10">
      <ScreenHeader
        section="home"
        icon={getSection("home").icon}
        title={tNav("HomeHeading")}
        description={t("Description")}
      />

      {seesVisits && (
        <section className="space-y-4 tall:space-y-5">
          <SectionHeading>{t("Today")}</SectionHeading>
          <Today />
        </section>
      )}

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Alerts")}</SectionHeading>
        <AlertTiles />
      </section>

      {seesVisits && (
        <section className="space-y-4 tall:space-y-5">
          <SectionHeading>{t("DayBoard")}</SectionHeading>
          <Board />
        </section>
      )}
    </Screen>
  );
}
