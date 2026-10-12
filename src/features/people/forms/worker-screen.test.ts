import { describe, expect, it } from "vitest";

import { WORKER_FORM_SCREEN_ROWS } from "./worker-form";
import { WORKER_SCREEN_CARDS, WORKER_SCREEN_TITLE_ROW } from "./worker-screen";

describe("the registration screen's cards", () => {
  it("show every on-screen row of his form once, in his order", () => {
    const shown = [
      WORKER_SCREEN_TITLE_ROW,
      ...WORKER_SCREEN_CARDS.flatMap((card) => [...(card.heading ? [card.heading] : []), ...card.rows]),
    ];
    expect(shown).toEqual(WORKER_FORM_SCREEN_ROWS.map((row) => row.key));
  });

  it("restrict the health answers and the confidential score, and nothing else", () => {
    const restricted = WORKER_SCREEN_CARDS.filter((card) => card.restricted).map((card) => [card.id, card.restricted]);
    expect(restricted).toEqual([
      ["health", "HEALTH"],
      ["hiringScore", "SCORE"],
    ]);
  });
});
