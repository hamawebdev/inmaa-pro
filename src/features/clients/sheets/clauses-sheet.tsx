import { Ltr } from "@/components/ltr";
import { KeepTogether, PrintSheet, SHEET_FONT } from "@/components/print";

import type { Clause } from "../services/contracts";

/**
 * «ملحق العقد»: the clauses of a contract, printed as an annex to his signed
 * sheet and never inside it (File.clauses), on his client letterhead.
 */

const TYPE = {
  title: { fontFamily: SHEET_FONT.traditional, fontSize: "20pt", fontWeight: 700, textAlign: "center" },
  head: { fontFamily: SHEET_FONT.sakkal, fontSize: "13pt", fontWeight: 700 },
  text: { fontFamily: SHEET_FONT.sakkal, fontSize: "12.5pt", lineHeight: 1.55 },
} as const;

export function ClausesSheet({
  number,
  clientName,
  clauses,
}: {
  number: string;
  clientName: string;
  clauses: Clause[];
}) {
  return (
    <PrintSheet letterhead="client">
      <h1 style={{ ...TYPE.title, margin: "0 0 2mm" }}>ملحق العقد: البنود</h1>
      <p style={{ ...TYPE.text, margin: "0 0 5mm", textAlign: "center" }}>
        العقد رقم <Ltr>{number}</Ltr> — {clientName}
      </p>
      {clauses.map((clause, index) => (
        <KeepTogether key={index}>
          <p style={{ ...TYPE.head, margin: "3mm 0 1mm" }}>
            المادة <Ltr>{index + 1}</Ltr>
            {clause.title ? `: ${clause.title}` : ""}
          </p>
          <p style={{ ...TYPE.text, margin: 0, whiteSpace: "pre-wrap" }}>{clause.body}</p>
        </KeepTogether>
      ))}
      <KeepTogether>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "12mm", marginTop: "10mm" }}>
          <p style={{ ...TYPE.head, margin: 0, textAlign: "center" }}>إمضاء وختم المركز</p>
          <p style={{ ...TYPE.head, margin: 0, textAlign: "center" }}>إمضاء العميل</p>
        </div>
        <div style={{ height: "24mm" }} />
      </KeepTogether>
    </PrintSheet>
  );
}
