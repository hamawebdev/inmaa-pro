#!/usr/bin/env python3
"""Write the first version of docs/checker-table.md.

    python3 -I docs/checker/tools/build_table.py            # refuses if the table exists
    python3 -I docs/checker/tools/build_table.py --force     # overwrite (statuses are lost)
    python3 -I docs/checker/tools/build_table.py --stdout    # print, write nothing

After this first build the table is kept by hand (routes, field names,
statuses, notes). Do not rebuild over an edited table: run validate_table.py
instead, which compares every string in it with the Word XML.
"""

import os
import re
import sys

sys.dont_write_bytecode = True  # keep docs/checker/tools free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import formxml as fx  # noqa: E402
import mapping  # noqa: E402
import rows as rw  # noqa: E402
import table_data as td  # noqa: E402

OUT = os.path.join(fx.ROOT, "docs", "checker-table.md")
PLAN = os.path.join(fx.ROOT, "plan", "src", "plan-ar.md")

COLUMNS = ["ID", "Source", "Kind", "His text", "Options or blank, as written, in order", "Maps to",
           "Prints on", "Owner", "Screen", "Print", "Notes"]

FOLDER_OWNER = [
    ("files/[id]/tasks/", "O"), ("files/[id]/visits/", "O"), ("files/[id]/handouts/", "M"), ("files/[id]/payments/", "M"),
    ("home/", "F"), ("settings/", "F"), ("src/lock/", "F"),
    ("employees/", "P"), ("employee-attendance/", "P"), ("workers/", "P"), ("hiring/", "P"), ("hours-pay/", "P"),
    ("files/", "C"), ("clients/", "C"), ("rep-visits/", "C"),
    ("supervisors/", "O"), ("work-program/", "O"), ("worker-attendance/", "O"), ("visits/", "O"), ("quality/", "O"),
    ("expenses/", "M"), ("income/", "M"), ("invoices/", "M"), ("payments/", "M"), ("reports/", "M"),
    ("inventory/", "M"), ("handouts/", "M"), ("purchases/", "M"), ("maintenance/", "M"),
]
OWNER_NAME = {"F": "Foundation", "P": "People", "C": "Clients and contracts", "O": "Operations", "M": "Money and stock"}


def folder_owner(folder):
    for prefix, owner in FOLDER_OWNER:
        if folder.startswith(prefix):
            return owner
    return None


def feature_names():
    names = {}
    with open(PLAN, encoding="utf8") as fh:
        for line in fh:
            m = re.match(r"^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|", line)
            if m:
                names[int(m.group(1))] = m.group(2).strip()
    return names


def feature_rows():
    names = feature_names()
    out = []
    for n in range(1, 50):
        verdict, places, prints, note = td.FEATURES[n]
        name = names[n]
        if not places:
            out.append(dict(id="F-%02d" % n, source="plan #%d" % n, kind="feature", text=name, items="—",
                            maps=td.NP, prints="—", owner="none", screen="n/a", print="n/a",
                            notes="Not built. %s" % note))
            continue
        # the sheet prints from the visit page when there is one, else from the first place
        print_at = 0
        for i, (place, _, _) in enumerate(places):
            if "visit page" in place or "printed order" in place:
                print_at = i
        for i, (place, folder, owner) in enumerate(places):
            rid = "F-%02d" % n if len(places) == 1 else "F-%02d%s" % (n, "ab"[i])
            notes = [verdict]
            if note:
                notes.append(note)
            fo = folder_owner(folder.split(",")[0].strip())
            if fo and fo != owner:
                notes.append("The page folder `%s` belongs to %s" % (folder.split(",")[0].strip(), OWNER_NAME[fo]))
            if place == "the printed order":
                notes.append("The mission order sheet belongs to Operations")
            has_print = bool(prints) and i == print_at
            if place == "the printed order":
                maps, screen = "print only: address, landmark and written directions on the mission order", "n/a"
            else:
                maps = "%s (pages `%s`)" % (place, "`, `".join(x.strip() for x in folder.split(","))) if not folder.startswith("src/") else "%s (`%s`)" % (place, folder)
                screen = "not built"
            out.append(dict(id=rid, source="plan #%d" % n, kind="feature", text=name, items="—", maps=maps,
                            prints=prints if has_print else "—", owner=owner, screen=screen,
                            print="not built" if has_print else "n/a", notes=". ".join(x.rstrip(".") for x in notes)))
    return out


def form_rows(code):
    model = fx.load_form(code)
    rows = rw.derive(model)
    mapping.annotate(code, rows, model)
    out = []
    for row in rows:
        out.append(dict(id=row["id"], source=rw.source_cell(row), kind=row["kind"], text=row["text"],
                        items=rw.items_cell(row), maps=row["maps"], prints=row["prints"], owner=row["owner"],
                        screen=row["screen"], print=row["print"], notes=row["notes_out"]))
        if code == "B" and row["id"] == "B-001":
            out.append(dict(id="BX-001", source="scope A1 (no Word file)", kind="title", text="نوع الخدمة : عقد (تجمع سكني)",
                            items="—", maps="طلبات الخدمة › الملفات › التجمعات السكنية · عقد › الاستمارة (pages `files/`), screen title",
                            prints="complexes copy", owner="C", screen="not built", print="not built",
                            notes="The complexes copy is the building contract sheet with this title; every B row applies to it. He gave no form for complexes (F1, A1)"))
    for lh in mapping.letterhead_rows(code, len(rows) + 1, model):
        out.append(dict(id=lh["id"], source=lh["loc"], kind="image", text=lh["text"], items="—", maps=lh["maps"],
                        prints=lh["prints"], owner=lh["owner"], screen=lh["screen"], print=lh["print"], notes=lh["notes_out"]))
    return out


def note_rows():
    out = []
    for prefix, photo, data in (("N1", td.PHOTO1, td.NOTES_1), ("N2", td.PHOTO2, td.NOTES_2)):
        for i, (reading, conf, maps, owner, note) in enumerate(data, 1):
            unreadable = conf == "unreadable"
            notes = "Not readable" if unreadable else "Read: %s" % conf
            if note:
                notes += ". " + note.rstrip(".")
            out.append(dict(id="%s-%02d" % (prefix, i), source="photo %s, line %d" % ("(1)" if prefix == "N1" else "(sideways)", i) if not unreadable else "photo %s, margin" % ("(1)" if prefix == "N1" else "(sideways)"),
                            kind="note", text=reading, items="—", maps=maps, prints="—", owner=owner,
                            screen="n/a" if unreadable else "not built", print="n/a", notes=notes))
    return out


def md_cell(s):
    return str(s).replace("|", "\\|").replace("\n", " ").strip() or "—"


def render(all_rows, counts):
    lines = []
    lines.append("# Checker table")
    lines.append("")
    lines.append("Every numbered feature, every field of his six Word forms and every line of his two handwritten pages, "
                 "each mapped to a screen or marked \"not possible offline\". Kept by the Checker; nobody else edits it.")
    lines.append("")
    lines.append("**How to read it**")
    lines.append("")
    lines.append("- **ID.** `F-07a`: feature 7, first of the two places the scope names. `W`, `B`, `OR`, `OC`, `HR`, `HC`: worker form, "
                 "building contract, organisation request, organisation contract, home request, home contract, numbered in form order. "
                 "`BX-001`: the title of the complexes copy. `N1`, `N2`: the handwritten pages (N1 is the upright photo "
                 "`…19.26.23(1).jpeg`, which reads first; N2 is the sideways one). Ids never change. One option is addressed as row plus index: `W-024.3`.")
    lines.append("- **Source.** Where the text sits in the Word file: `T1.r2.c1 › T1.r2.c2` is table 1, row 2, label in cell 1, blank or options in cell 2. "
                 "Cells are counted in file order, which is right to left on paper. `P2` is a paragraph, `P2.box` the text box anchored to it. "
                 "The same ids are used in `docs/checker/forms/` and `docs/checker/data/`.")
    lines.append("- **His text** is his wording with the stretching character removed and every blank written `……`. "
                 "His spellings are kept. Print uses his raw strings, which are in the layout files.")
    lines.append("- **Options or blank.** Options in his order, numbered `[1]`, `[2]`. A bare `……` is a dotted blank with no ☐. For a plain field it is the blank as he drew it (`…… دج`).")
    lines.append("- **Maps to** uses the scope's screen names and the page folders of CLAUDE.md. Routes and field names are added from the code once it exists.")
    lines.append("- **Screen** and **Print**: `not built`, `built`, `checked`, `mismatch`, or `n/a`. A row is `checked` only when the label and every option match in wording and order.")
    lines.append("- **Notes** carry the ids of scope section 7 and 9 (H, P, F, R, A, and `scope N1` to `scope N3`, written that way so they are not taken for the handwritten blocks), "
                 "question numbers (س) and the Checker's own findings (K), which are listed in `docs/checker/forms/differences.md`.")
    lines.append("")
    lines.append("**Rows:** " + " · ".join("%s %d" % (k, v) for k, v in counts) + ".")
    lines.append("")
    lines.append("Check it with `python3 -I docs/checker/tools/validate_table.py`.")
    lines.append("")
    lines.append("| " + " | ".join(COLUMNS) + " |")
    lines.append("|" + "|".join(["---"] * len(COLUMNS)) + "|")
    for r in all_rows:
        lines.append("| " + " | ".join(md_cell(r[k]) for k in ("id", "source", "kind", "text", "items", "maps", "prints", "owner", "screen", "print", "notes")) + " |")
    lines.append("")
    return "\n".join(lines)


def main(argv):
    blocks = [("features", feature_rows())]
    for code in fx.FORMS:
        blocks.append((fx.FORMS[code]["name"], form_rows(code)))
    notes = note_rows()
    blocks.append(("handwritten lines", notes))
    all_rows = [r for _, rs in blocks for r in rs]
    counts = [(name, len(rs)) for name, rs in blocks] + [("total", len(all_rows))]
    text = render(all_rows, counts)
    if "--stdout" in argv:
        sys.stdout.write(text)
        return 0
    if os.path.exists(OUT) and "--force" not in argv:
        sys.stderr.write("%s exists. It is kept by hand; use --force only to start again.\n" % OUT)
        return 2
    with open(OUT, "w", encoding="utf8") as fh:
        fh.write(text)
    print("wrote %s" % OUT)
    for name, n in counts:
        print("  %-28s %d" % (name, n))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
