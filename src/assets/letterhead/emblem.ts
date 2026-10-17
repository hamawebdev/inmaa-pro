import emblemSrc from "./emblem.png";

/**
 * The centre's emblem: the round picture on the right of his letterhead's
 * header (the book, the cap, the broom and the chart), cut from
 * `header.png` with a transparent surround, 256 px square.
 *
 * It is the centre's logo wherever a logo is drawn (an ID card's header band,
 * as the academy's card carries its logo) until the manager stores another in
 * Settings › عام (`centre.logoUrl`). On a screen use `useCentreLogo()`
 * (src/hooks/use-centre-logo.ts), which gives the stored logo or this one; a
 * printed sheet takes that `src` as data.
 */
export const CENTRE_EMBLEM_SRC: string = emblemSrc;
