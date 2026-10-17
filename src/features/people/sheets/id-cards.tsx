import type { CSSProperties } from "react";

import { Ltr } from "@/components/ltr";
import { PageBreak, PrintSheet, SHEET_FONT } from "@/components/print";
import type { StaffCard, StaffCards } from "@/features/people/services/cards";

/**
 * ID cards (scope R9): the academy's card without its QR code, at the real
 * size of an identity card (ISO ID-1, 85.6 × 54 mm), eight to an A4 page in
 * two columns, each with its cutting marks at the corners. Photo (or the empty
 * frame), the name surname first, the registration number, the role in his
 * words, the centre.
 *
 * Pure: the photos come resolved, as addresses an `<img>` can show.
 */

const CARD = { width: 85.6, height: 54 } as const;
const GAP = { x: 8, y: 8 } as const;
const PER_PAGE = 8;
const MARK = { length: 3, offset: 1, weight: 0.2 } as const;
const mm = (value: number) => `${value}mm`;
const ink: CSSProperties = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };
const text = (pt: number, bold = false): CSSProperties => ({
  fontFamily: SHEET_FONT.sakkal,
  fontSize: `${pt}pt`,
  fontWeight: bold ? 700 : 400,
  lineHeight: 1.15,
});
const dateAr = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** The eight short lines at a card's corners, outside it, where the cutter goes. */
function CuttingMarks() {
  const line = (style: CSSProperties) => (
    <span style={{ position: "absolute", background: "#000", ...ink, ...style }} />
  );
  const horizontal = { width: mm(MARK.length), height: mm(MARK.weight) };
  const vertical = { width: mm(MARK.weight), height: mm(MARK.length) };
  const out = mm(-(MARK.offset + MARK.length));
  return (
    <>
      {line({ ...horizontal, top: 0, left: out })}
      {line({ ...vertical, top: out, left: 0 })}
      {line({ ...horizontal, top: 0, right: out })}
      {line({ ...vertical, top: out, right: 0 })}
      {line({ ...horizontal, bottom: 0, left: out })}
      {line({ ...vertical, bottom: out, left: 0 })}
      {line({ ...horizontal, bottom: 0, right: out })}
      {line({ ...vertical, bottom: out, right: 0 })}
    </>
  );
}

function Card({
  card,
  centre,
  issuedDate,
  photo,
  logo,
}: {
  card: StaffCard;
  centre: StaffCards["centre"];
  issuedDate: string;
  photo: string | null;
  logo: string | null;
}) {
  return (
    <div style={{ position: "relative", width: mm(CARD.width), height: mm(CARD.height) }}>
      <CuttingMarks />
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: "0.3mm solid #000",
          borderRadius: mm(3),
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
        }}
      >
        <div
          style={{
            ...ink,
            background: "#d9d9d9",
            height: mm(11),
            padding: `0 ${mm(3)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: mm(2),
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: mm(1.5) }}>
            {/* The centre's emblem, as the academy's card carries its logo (S-32). */}
            {logo && <img src={logo} alt="" style={{ width: mm(8), height: mm(8), objectFit: "contain" }} />}
            <span style={text(10, true)}>{centre.nameAr}</span>
          </span>
          <span style={{ ...text(6.5), direction: "ltr" }}>{centre.nameLatin}</span>
        </div>
        <div style={{ flex: 1, display: "flex", gap: mm(3), padding: `${mm(2.5)} ${mm(3)} 0` }}>
          <div
            style={{
              width: mm(20),
              height: mm(25),
              flexShrink: 0,
              border: "0.25mm solid #000",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {photo ? (
              <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ ...text(6.5), color: "#777" }}>الصورة</span>
            )}
          </div>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: mm(1.5) }}>
            <span style={text(11, true)}>{card.name}</span>
            {card.roleAr && <span style={text(9)}>{card.roleAr}</span>}
            <span style={text(8.5)}>
              رقم التسجيل: <Ltr style={{ fontWeight: 700 }}>{card.number}</Ltr>
            </span>
          </div>
        </div>
        <div
          style={{
            ...text(6.5),
            display: "flex",
            justifyContent: "space-between",
            padding: `0 ${mm(3)} ${mm(1.8)}`,
          }}
        >
          <span>
            تاريخ الإصدار: <Ltr>{dateAr(issuedDate)}</Ltr>
          </span>
          <span>
            {centre.city} — <Ltr>{centre.phone}</Ltr>
          </span>
        </div>
      </div>
    </div>
  );
}

export function IdCardsSheet({
  data,
  photos,
  logo = null,
}: {
  data: StaffCards;
  photos: Readonly<Record<string, string | null>>;
  /** The centre's logo or emblem, resolved by the page. */
  logo?: string | null;
}) {
  const pages: StaffCard[][] = [];
  for (let index = 0; index < data.cards.length; index += PER_PAGE)
    pages.push(data.cards.slice(index, index + PER_PAGE));
  return (
    <PrintSheet>
      {pages.flatMap((page, index) => [
        ...(index > 0 ? [<PageBreak key={`break-${index}`} />] : []),
        <div
          key={`page-${index}`}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(2, ${mm(CARD.width)})`,
            columnGap: mm(GAP.x),
            rowGap: mm(GAP.y),
            justifyContent: "center",
            paddingTop: mm(MARK.offset + MARK.length),
          }}
        >
          {page.map((card) => (
            <Card
              key={card.id}
              card={card}
              centre={data.centre}
              issuedDate={data.issuedDate}
              photo={photos[card.id] ?? null}
              logo={logo}
            />
          ))}
        </div>,
      ])}
    </PrintSheet>
  );
}
