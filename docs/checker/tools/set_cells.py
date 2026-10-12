#!/usr/bin/env python3
"""Set cells of docs/checker-table.md from a JSON file of updates.

    python3 -I docs/checker/tools/set_cells.py updates.json [--dry-run]

updates.json: {"W-005": {"Print": "checked", "Maps to+": " · print: `/dashboard/…`",
                         "Notes+": "Print 2026-10-12: …"}, …}

A key names a column as in the table's header. "Column+" appends to what the
cell holds (an empty cell, "—", is replaced); "Column" replaces it. Rows that
are not named are left as they are, byte for byte. The table keeps its hand
edits: this only touches the cells it is told to. Run validate_table.py after.
"""

import json
import os
import re
import sys

sys.dont_write_bytecode = True
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
TABLE = os.path.join(ROOT, "docs", "checker-table.md")


def split_row(line):
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line.rstrip("\n"))[1:-1]]


def join_row(cells):
    return "| " + " | ".join(c.replace("|", "\\|").replace("\n", " ") for c in cells) + " |"


def main(argv):
    updates = json.load(open(argv[0], encoding="utf8"))
    lines = open(TABLE, encoding="utf8").read().split("\n")
    header = None
    done = set()
    for i, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        cells = split_row(line)
        if header is None:
            header = cells
            continue
        if all(re.match(r"^:?-+:?$", c) for c in cells):
            continue
        rid = cells[0]
        if rid not in updates:
            continue
        for key, value in updates[rid].items():
            append = key.endswith("+")
            col = key[:-1] if append else key
            if col not in header:
                raise SystemExit("no column %r" % col)
            k = header.index(col)
            if append:
                cells[k] = value.strip() if cells[k] in ("", "—") else (cells[k] + value)
            else:
                cells[k] = value
        lines[i] = join_row(cells)
        done.add(rid)
    missing = sorted(set(updates) - done)
    if missing:
        raise SystemExit("rows not found: %s" % missing)
    if "--dry-run" in argv:
        print("would update %d rows" % len(done))
        return 0
    with open(TABLE, "w", encoding="utf8") as fh:
        fh.write("\n".join(lines))
    print("updated %d rows of %s" % (len(done), os.path.relpath(TABLE, ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
