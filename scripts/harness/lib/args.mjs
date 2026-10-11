/**
 * `--name value`, `--flag`, and repeated `--name` for lists. Nothing else.
 *
 * @param {string[]} argv
 * @param {{ lists?: string[], flags?: string[] }} [shape]
 * @returns {Record<string, any>}
 */
export function parseArgs(argv, { lists = [], flags = [] } = {}) {
  const out = {};
  for (const name of lists) out[name] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument "${token}"`);
    const name = token.slice(2);
    if (flags.includes(name)) {
      out[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    index += 1;
    if (lists.includes(name)) out[name].push(value);
    else out[name] = value;
  }
  return out;
}

/** A route as a file-name part: "/dashboard/files/12/quote" becomes "files-12-quote". */
export function routeSlug(route, page) {
  if (page && page !== "index.html") return page.replace(/\.html$/, "");
  const slug = String(route ?? "")
    .replace(/^\/?dashboard\/?/, "")
    .replace(/[?#].*$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "root";
}
