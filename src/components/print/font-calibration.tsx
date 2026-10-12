import { useEffect, useState } from "react";

import { useTranslations } from "use-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { SHEET_FONT_NAME, SHEET_FONT_SCALE, SHEET_FONT_STAND_IN, type SheetFont } from "./sheet-constants";

/**
 * On screen, beside the print sample: whether each of his three faces is on
 * this PC, and if it is, how large the stand-in must be set to take the room
 * his face takes. That is how `SHEET_FONT_SCALE` is checked on a PC that has
 * his fonts (his own, or any Windows with Arabic): the development machine has
 * none. Measures his tightest labels, as the scale was found from.
 */
const SAMPLE = "يوجد حارس ؟ تاريخ التسديد عدد مواقف السيارات هل عملت في المجال";

interface Measured {
  face: SheetFont;
  installed: boolean;
  regular: number | null;
  bold: number | null;
}

async function measure(): Promise<Measured[]> {
  await Promise.all([
    document.fonts.load(`400 16px "${SHEET_FONT_STAND_IN}"`),
    document.fonts.load(`700 16px "${SHEET_FONT_STAND_IN}"`),
  ]);
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:48px;direction:rtl";
  probe.textContent = SAMPLE;
  document.body.appendChild(probe);
  const width = (family: string, weight: number) => {
    probe.style.fontFamily = family;
    probe.style.fontWeight = String(weight);
    return probe.getBoundingClientRect().width;
  };
  try {
    return (Object.keys(SHEET_FONT_NAME) as SheetFont[]).map((face) => {
      const his = (weight: number) => width(`"${SHEET_FONT_NAME[face]}", "${SHEET_FONT_STAND_IN}"`, weight);
      const standIn = (weight: number) => width(`"${SHEET_FONT_STAND_IN}"`, weight);
      // Missing, the browser sets the line in the stand-in: the two widths are then equal.
      const installed = Math.abs(his(400) - standIn(400)) > 0.5;
      return {
        face,
        installed,
        regular: installed ? his(400) / standIn(400) : null,
        bold: installed ? his(700) / standIn(700) : null,
      };
    });
  } finally {
    probe.remove();
  }
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function FontCalibration() {
  const t = useTranslations("PrintSample.Calibration");
  const [rows, setRows] = useState<Measured[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void measure().then((measured) => {
      if (!cancelled) setRows(measured);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="mx-auto mt-6 max-w-3xl">
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-start font-medium">{t("Face")}</th>
              <th className="py-1 text-start font-medium">{t("OnThisPc")}</th>
              <th className="py-1 text-start font-medium">{t("Measured")}</th>
              <th className="py-1 text-start font-medium">{t("InUse")}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(SHEET_FONT_NAME) as SheetFont[]).map((face) => {
              const row = rows?.find((candidate) => candidate.face === face);
              const scale = SHEET_FONT_SCALE[face];
              return (
                <tr key={face} className="border-t">
                  <td className="py-1.5" dir="ltr">
                    {SHEET_FONT_NAME[face]}
                  </td>
                  <td className="py-1.5">{row ? t(row.installed ? "Present" : "Missing") : "…"}</td>
                  <td className="py-1.5" dir="ltr">
                    {row?.regular && row.bold ? `${percent(row.regular)} / ${percent(row.bold)}` : "—"}
                  </td>
                  <td className="py-1.5" dir="ltr">
                    {`${percent(scale.regular)} / ${percent(scale.bold)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
