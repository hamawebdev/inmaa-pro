/**
 * A number read left to right inside a text of either direction, for a place
 * that takes a string and not an element (a screen's title): what `<Ltr>` does,
 * written with the Unicode isolates U+2066 and U+2069. «الملف 1/BLC» would
 * otherwise read «BLC/1» in an Arabic heading.
 */
export const ltr = (text: string) => `\u2066${text}\u2069`;
