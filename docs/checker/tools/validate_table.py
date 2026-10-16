#!/usr/bin/env python3
"""Compare docs/checker-table.md with the Word XML and the plan.

    python3 -I docs/checker/tools/validate_table.py            # table + data files
    python3 -I docs/checker/tools/validate_table.py --quiet    # failures only
    python3 -I docs/checker/tools/validate_table.py --table X  # check another copy

It reads the Markdown table as it is on disk; it does not rebuild it. Checks:

  T1  the table has the eleven expected columns and every row has eleven cells
  T2  ids are unique, well formed, in block order, and numbered without gaps
  T3  kind, owner and the two status cells use the allowed words
  T4  features 1 to 49 are all present and named as in plan/src/plan-ar.md
  T5  per form: the words of "His text" and of the options, row after row,
      are the words of the Word file in file order. Nothing in the form is
      left without a row; nothing in a row is absent from the form.
  T6  per form row: the Source ids exist in the file, the label words sit in
      the label cell and the option words in the value cells
  T7  option numbers run [1], [2], … inside each row
  T8  no stretching character (U+0640) is left in the table
  T9  per form: the number of numbered options in choice rows equals the
      number of ☐ in the file, plus the known options that have no ☐
  D1  docs/checker/data/*.json equals a fresh extraction (when present)
  L1  the legal rules section has its nine columns and every row nine cells
  L2  its ids run L-01, L-02, … in order without gaps
  L3  status, owner and "Enforced in" are filled with allowed words; a mismatch
      names an open audit finding; a checked row names a test (or the lint
      gate, `npm run lint`), and every test it names exists

Exit status 0 when every check passes, 1 otherwise.
"""

import json
import os
import re
import sys
import unicodedata

sys.dont_write_bytecode = True  # keep docs/checker/tools free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import formxml as fx  # noqa: E402

TABLE = os.path.join(fx.ROOT, "docs", "checker-table.md")
PLAN = os.path.join(fx.ROOT, "plan", "src", "plan-ar.md")
DATA = os.path.join(fx.ROOT, "docs", "checker", "data")

COLUMNS = ["ID", "Source", "Kind", "His text", "Options or blank, as written, in order", "Maps to",
           "Prints on", "Owner", "Screen", "Print", "Notes"]
KINDS = {"feature", "title", "number", "date", "heading", "field", "choice", "static", "signature", "image", "note"}
OWNERS = {"F", "P", "C", "O", "M", "none"}
STATUS = {"not built", "built", "checked", "mismatch", "n/a"}
BLOCK_ORDER = ["F", "W", "B", "OR", "OC", "HR", "HC", "N1", "N2"]
# Options that are numbered in the table but have no ☐ in the file.
NO_BOX = {
    "W": (2, "«نعم» and «لا» under «هل عملت في المجال» are drawn ovals"),
    "B": (1, "«عدد الزيارات» has six labels and five ☐"),
    "OC": (1, "«عدد الزيارات» has six labels and five ☐"),
    "HC": (1, "«عدد الزيارات» has six labels and five ☐"),
}


class Report(object):
    def __init__(self, quiet):
        self.quiet = quiet
        self.failed = 0
        self.passed = 0

    def ok(self, code, msg):
        self.passed += 1
        if not self.quiet:
            print("PASS %-3s %s" % (code, msg))

    def fail(self, code, msg):
        self.failed += 1
        print("FAIL %-3s %s" % (code, msg))


def keep(ws):
    """Words that carry a letter or a digit; a lone slash is drawing, not text."""
    return [w for w in ws if any(unicodedata.category(c)[0] in "LN" for c in w)]


LEGAL_HEADING = "## Legal rules"
LEGAL_COLUMNS = ["ID", "Rule", "Part", "Enforced in", "Proved by", "Status", "Owner", "Findings", "Notes"]
LEGAL_STATUS = {"checked", "mismatch", "not built", "n/a"}
FINDING = re.compile(r"\b(?:INV|LOG|ACC|LAB|OFF)-[A-Z]?\d+\b")


def read_table(path, legal=False):
    """The rows of the main table, or with `legal` those of the legal rules section."""
    rows, header = [], None
    inside = not legal
    with open(path, encoding="utf8") as fh:
        for no, line in enumerate(fh, 1):
            if line.startswith(LEGAL_HEADING):
                if not legal:
                    break
                inside = True
                continue
            if not inside or not line.startswith("|"):
                continue
            cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line.rstrip("\n"))[1:-1]]
            if header is None:
                header = cells
                continue
            if all(re.match(r"^:?-+:?$", c) for c in cells):
                continue
            rows.append((no, cells))
    return header, rows


def split_items(cell):
    """-> (texts in order, option numbers found)"""
    if cell in ("—", ""):
        return [], []
    texts, numbers = [], []
    for part in cell.split(" · "):
        m = re.match(r"^\[(\d+)\] (.*)$", part)
        if m:
            numbers.append(int(m.group(1)))
            texts.append(m.group(2))
        else:
            texts.append(part)
    return texts, numbers


def expand_locs(src):
    """'T1.r2.c1 › T1.r2.c2' -> ('T1.r2.c1', ['T1.r2.c2']); ranges expanded."""

    def expand(s):
        s = s.strip()
        m = re.match(r"^(T\d+\.r\d+)\.c(\d+)–c(\d+)$", s)
        if m:
            return ["%s.c%d" % (m.group(1), i) for i in range(int(m.group(2)), int(m.group(3)) + 1)]
        m = re.match(r"^P(\d+)–P(\d+)$", s)
        if m:
            return ["P%d" % i for i in range(int(m.group(1)), int(m.group(2)) + 1)]
        return [s]

    if " › " in src:
        a, b = src.split(" › ", 1)
        return expand(a)[0], expand(b), expand(a)
    locs = expand(src)
    return locs[0], [], locs



def check_legal(rep, table):
    """L1 columns, L2 ids L-01.. without gaps, L3 status, owner, findings and proving tests."""
    header, rows = read_table(table, legal=True)
    if header is None:
        rep.fail("L1", "no %r section with its table" % LEGAL_HEADING)
        return
    bad = [no for no, cells in rows if len(cells) != len(LEGAL_COLUMNS)]
    if header != LEGAL_COLUMNS:
        rep.fail("L1", "legal header is %r" % header)
        return
    if bad:
        rep.fail("L1", "legal rows with a wrong number of cells at lines %s" % bad[:10])
        return
    rep.ok("L1", "%d legal rows, %d columns each" % (len(rows), len(LEGAL_COLUMNS)))
    recs = [dict(zip(["id", "rule", "part", "where", "proof", "status", "owner", "findings", "notes"], cells), line=no)
            for no, cells in rows]
    ids = [r["id"] for r in recs]
    if ids != ["L-%02d" % n for n in range(1, len(ids) + 1)]:
        rep.fail("L2", "legal ids are not L-01 to L-%02d in order: %s" % (len(ids), ids[:5]))
    else:
        rep.ok("L2", "legal ids L-01 to L-%02d in order" % len(ids))
    problems = []
    for r in recs:
        if r["status"] not in LEGAL_STATUS:
            problems.append("%s status %r" % (r["id"], r["status"]))
        owners = [o.strip() for o in r["owner"].split(",")]
        if any(o not in OWNERS for o in owners):
            problems.append("%s owner %r" % (r["id"], r["owner"]))
        if r["where"] in ("", "—") and r["status"] != "n/a":
            problems.append("%s says nowhere where it is enforced" % r["id"])
        open_findings = FINDING.findall(r["findings"].split("(")[0])
        if r["status"] == "mismatch" and not open_findings:
            problems.append("%s is a mismatch with no open finding named" % r["id"])
        if r["status"] == "checked" and open_findings and "fixed" not in r["findings"]:
            problems.append("%s is checked while naming open findings %s" % (r["id"], open_findings))
        tests = re.findall(r"[\w./-]+\.test\.ts", r["proof"])
        if r["status"] == "checked" and not tests and "`npm run lint`" not in r["proof"]:
            problems.append("%s is checked with no test named" % r["id"])
        for t in tests:
            if not os.path.exists(os.path.join(fx.ROOT, t)):
                problems.append("%s names a test that does not exist: %s" % (r["id"], t))
    if problems:
        for p in problems[:20]:
            rep.fail("L3", p)
    else:
        rep.ok("L3", "legal statuses, owners, findings and proving tests are consistent (%s)" % ", ".join(
            "%s %d" % (st, sum(1 for r in recs if r["status"] == st)) for st in sorted(LEGAL_STATUS)))


def main(argv):
    rep = Report("--quiet" in argv)
    table = TABLE
    if "--table" in argv:  # check another copy, for example a draft
        table = argv[argv.index("--table") + 1]
    if not os.path.exists(table):
        print("FAIL     %s does not exist" % table)
        return 1
    header, rows = read_table(table)

    # ---- T1
    bad = [no for no, cells in rows if len(cells) != len(COLUMNS)]
    if header != COLUMNS:
        rep.fail("T1", "header is %r" % header)
    elif bad:
        rep.fail("T1", "rows with a wrong number of cells at lines %s" % bad[:10])
    else:
        rep.ok("T1", "%d rows, %d columns each" % (len(rows), len(COLUMNS)))
    recs = []
    for no, cells in rows:
        if len(cells) == len(COLUMNS):
            recs.append(dict(zip(["id", "source", "kind", "text", "items", "maps", "prints", "owner", "screen", "print", "notes"], cells), line=no))

    # ---- T2
    problems = []
    seen = set()
    order = []
    per_block = {}
    for r in recs:
        rid = r["id"]
        if rid in seen:
            problems.append("duplicate id %s" % rid)
        seen.add(rid)
        m = re.match(r"^(F)-(\d\d)([ab])?$|^(W|B|OR|OC|HR|HC)-(\d\d\d)$|^(BX)-(\d\d\d)$|^(N1|N2)-(\d\d)$", rid)
        if not m:
            problems.append("malformed id %s (line %d)" % (rid, r["line"]))
            continue
        block = m.group(1) or m.group(4) or ("B" if m.group(6) else None) or m.group(8)
        r["block"] = block
        r["special"] = bool(m.group(6))
        if not order or order[-1] != block:
            order.append(block)
        if not m.group(6):
            per_block.setdefault(block, []).append(r)
    if order != [b for b in BLOCK_ORDER if b in order] or len(order) != len(set(order)):
        problems.append("blocks out of order: %s" % order)
    for block, rs in per_block.items():
        if block == "F":
            continue
        nums = [int(r["id"].split("-")[1]) for r in rs]
        if nums != list(range(1, len(nums) + 1)):
            problems.append("%s rows are not numbered 1..%d without gaps" % (block, len(nums)))
    if problems:
        for p in problems[:20]:
            rep.fail("T2", p)
    else:
        rep.ok("T2", "ids unique and in order: " + ", ".join("%s %d" % (b, len(per_block.get(b, []))) for b in BLOCK_ORDER))

    # ---- T3
    problems = []
    for r in recs:
        if r["kind"] not in KINDS:
            problems.append("%s kind %r" % (r["id"], r["kind"]))
        if r["owner"] not in OWNERS:
            problems.append("%s owner %r" % (r["id"], r["owner"]))
        for col in ("screen", "print"):
            if r[col] not in STATUS:
                problems.append("%s %s status %r" % (r["id"], col, r[col]))
        if r["maps"] in ("", "—"):
            problems.append("%s has no mapping" % r["id"])
    if problems:
        for p in problems[:20]:
            rep.fail("T3", p)
    else:
        rep.ok("T3", "kind, owner, status and mapping cells are all filled with allowed words")

    # ---- T4
    names = {}
    with open(PLAN, encoding="utf8") as fh:
        for line in fh:
            m = re.match(r"^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|", line)
            if m:
                names[int(m.group(1))] = m.group(2).strip()
    problems = []
    found = {}
    for r in per_block.get("F", []):
        n = int(r["id"][2:4])
        found.setdefault(n, []).append(r)
        if names.get(n) != r["text"]:
            problems.append("%s is named %r, the plan says %r" % (r["id"], r["text"], names.get(n)))
        if r["source"] != "plan #%d" % n:
            problems.append("%s source %r" % (r["id"], r["source"]))
    missing = [n for n in range(1, 50) if n not in found]
    if missing:
        problems.append("features missing: %s" % missing)
    for n, rs in found.items():
        suff = [r["id"][4:] for r in rs]
        if suff not in ([""], ["a", "b"]):
            problems.append("feature %d has rows %s" % (n, [r["id"] for r in rs]))
    not_built = sorted(n for n, rs in found.items() if rs[0]["maps"] == "not possible offline")
    if not_built != [28, 42, 43, 44, 45, 49]:
        problems.append("features marked not possible offline: %s (CLAUDE.md says 28, 42, 43, 44, 45, 49)" % not_built)
    if problems:
        for p in problems[:20]:
            rep.fail("T4", p)
    else:
        rep.ok("T4", "features 1 to 49 present and named as in the plan (%d rows, %d features in two places); not possible offline: %s"
               % (len(per_block.get("F", [])), sum(1 for rs in found.values() if len(rs) == 2), not_built))

    # ---- T5 to T9, per form
    total_boxes = 0
    for code in fx.FORMS:
        model = fx.load_form(code)
        locs = {}
        xml_words = []
        boxes = 0
        for loc, kind, obj in fx.iter_locations(model):
            ws = keep(fx.location_words(kind, obj))
            locs[loc] = ws
            xml_words.extend(ws)
            if kind == "cell":
                boxes += fx.cell_text(obj).count(fx.BOX)
            elif kind == "par":
                boxes += obj["text"].count(fx.BOX)
        total_boxes += boxes
        frows = [r for r in per_block.get(code, []) if r["kind"] != "image"]

        table_words = []
        t6, t7, t8 = [], [], []
        numbered_options = 0
        for r in frows:
            label_words = keep(fx.words(r["text"])) if r["text"] != "—" else []
            texts, numbers = split_items(r["items"])
            item_words = []
            for t in texts:
                item_words.extend(keep(fx.words(t)))
            table_words.extend(label_words)
            table_words.extend(item_words)
            if numbers != list(range(1, len(numbers) + 1)):
                t7.append("%s option numbers %s" % (r["id"], numbers))
            if r["kind"] == "choice":
                numbered_options += len(numbers)
            if fx.TATWEEL in r["text"] or fx.TATWEEL in r["items"]:
                t8.append(r["id"])
            label_loc, value_locs, all_first = expand_locs(r["source"])
            for loc in [label_loc] + value_locs + all_first:
                if loc not in locs:
                    t6.append("%s: source %r is not in the file" % (r["id"], loc))
            if any(loc not in locs for loc in [label_loc] + value_locs + all_first):
                continue
            if r["text"] != "—":
                hay = " ".join(locs[label_loc])
                if " ".join(label_words) not in hay:
                    t6.append("%s: label words are not in %s" % (r["id"], label_loc))
                pool = value_locs if value_locs else [label_loc]
            else:
                pool = all_first if not value_locs else [label_loc] + value_locs
            pool_words = []
            for loc in pool:
                pool_words.extend(locs[loc])
            hay = " " + " ".join(pool_words) + " "
            for t in texts:
                needle = " ".join(keep(fx.words(t)))
                if needle and (" " + needle + " ") not in hay:
                    t6.append("%s: «%s» is not in %s" % (r["id"], t, "+".join(pool)))

        if xml_words == table_words:
            rep.ok("T5", "%-2s %d rows carry the file's %d words in file order" % (code, len(frows), len(xml_words)))
        else:
            i = 0
            while i < min(len(xml_words), len(table_words)) and xml_words[i] == table_words[i]:
                i += 1
            rep.fail("T5", "%s words differ at word %d. file: %s | table: %s" % (
                code, i, " ".join(xml_words[max(0, i - 3):i + 5]), " ".join(table_words[max(0, i - 3):i + 5])))
        if t6:
            for p in t6[:15]:
                rep.fail("T6", p)
        else:
            rep.ok("T6", "%-2s every Source id exists and holds the row's words" % code)
        if t7:
            for p in t7[:15]:
                rep.fail("T7", p)
        else:
            rep.ok("T7", "%-2s option numbers run without gaps" % code)
        if t8:
            rep.fail("T8", "%s stretching character left in %s" % (code, t8[:10]))
        else:
            rep.ok("T8", "%-2s no stretching character in the table" % code)
        extra, why = NO_BOX.get(code, (0, ""))
        if numbered_options == boxes + extra:
            rep.ok("T9", "%-2s %d numbered options = %d ☐ in the file%s" % (code, numbered_options, boxes, (" + %d (%s)" % (extra, why)) if extra else ""))
        else:
            rep.fail("T9", "%s %d numbered options in choice rows, %d ☐ in the file, %d expected without a ☐" % (code, numbered_options, boxes, extra))

        # ---- D1
        path = os.path.join(DATA, fx.FORMS[code]["slug"] + ".json")
        if os.path.exists(path):
            with open(path, encoding="utf8") as fh:
                stored = json.load(fh)
            fresh = json.loads(json.dumps(model, ensure_ascii=False))
            stored_model = stored.get("model", stored)
            if stored_model == fresh:
                rep.ok("D1", "%-2s data file equals a fresh extraction (sha256 %s)" % (code, model["sha256"][:12]))
            else:
                rep.fail("D1", "%s %s differs from a fresh extraction; rerun build_forms.py" % (code, os.path.relpath(path, fx.ROOT)))

    notes = len(per_block.get("N1", [])) + len(per_block.get("N2", []))
    print("")
    print("Rows by block: features %d · " % len(per_block.get("F", [])) + " · ".join("%s %d" % (c, len(per_block.get(c, [])) + (1 if c == "B" and any(r.get("special") for r in recs) else 0)) for c in fx.FORMS)
          + " · handwritten %d · total %d" % (notes, len(recs)))
    print("☐ in the six files: %d. Handwritten rows are the Checker's readings and cannot be checked by a script." % total_boxes)
    check_legal(rep, table)
    print("%d checks passed, %d failed" % (rep.passed, rep.failed))
    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
