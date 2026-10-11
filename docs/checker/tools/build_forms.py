#!/usr/bin/env python3
"""Write the layout facts of the six Word forms.

    python3 -I docs/checker/tools/build_forms.py

Writes, all from the .docx files and nothing else:
    docs/checker/forms/01-worker.md … 06-home-contract.md
    docs/checker/forms/00-letterhead.md
    docs/checker/forms/differences.md
    docs/checker/data/01-worker.json … 06-home-contract.json
    docs/checker/assets/letterhead-header.png, letterhead-footer.jpeg

Safe to rerun: these files hold no hand edits. The hand-written parts are the
note lists in form_notes.py.
"""

import json
import math
import os
import sys
from collections import OrderedDict

sys.dont_write_bytecode = True  # keep docs/checker/tools free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import formxml as fx  # noqa: E402
import mapping  # noqa: E402
import rows as rw  # noqa: E402
import form_notes as fn  # noqa: E402

FORMS_DIR = os.path.join(fx.ROOT, "docs", "checker", "forms")
DATA_DIR = os.path.join(fx.ROOT, "docs", "checker", "data")
ASSETS_DIR = os.path.join(fx.ROOT, "docs", "checker", "assets")

EST = "**estimated**"

# Line height as a multiple of the type size. None of his fonts is installed
# here, so these are assumptions: Traditional Arabic is taken from the rows of
# the worker form whose saved height equals their content (ten 14 pt lines in
# 253.5 pt); the others are typical values. Used only for the page estimates.
LINE_FACTOR = {"Traditional Arabic": 1.57, "Sakkal Majalla": 1.41, "Arabic Typesetting": 1.2,
               "Times New Roman": 1.15, "MS Mincho": 1.0}
DEFAULT_FACTOR = 1.22
CHAR_WIDTH_EM = 0.36  # assumed average advance of a letter, in em
SPACE_WIDTH_EM = 0.25  # assumed advance of a space, in em


def mm(v):
    return ("%.1f" % v).rstrip("0").rstrip(".") if abs(v - round(v)) > 0.049 else "%d" % round(v)


def esc(s):
    return s.replace("|", "\\|").replace("\n", " ⏎ ")


def show(raw):
    """Raw text for the layout tables: his characters, stretching included;
    a run of dots is written …… (the exact runs are in the JSON)."""
    out = []
    for kind, s in _raw_tokens(raw):
        if kind == "blank":
            # dotted runs separated only by spaces are one blank
            if out and out[-1].strip() == "" and len(out) > 1 and out[-2] == fx.BLANK_MARK:
                out.pop()
                continue
            if out and out[-1] == fx.BLANK_MARK:
                continue
            out.append(fx.BLANK_MARK)
        else:
            out.append(s)
    return "".join(out).strip()


def _raw_tokens(raw):
    i, n, buf, out = 0, len(raw), [], []
    while i < n:
        m = fx._BLANK_RE.match(raw, i)
        if m and fx._is_blank_run(m.group(0)):
            if buf:
                out.append(("text", "".join(buf)))
                buf = []
            out.append(("blank", m.group(0)))
            i = m.end()
        elif m:
            buf.append(m.group(0))
            i = m.end()
        else:
            buf.append(raw[i])
            i += 1
    if buf:
        out.append(("text", "".join(buf)))
    return out


# --------------------------------------------------------------------------
# Type summaries
# --------------------------------------------------------------------------


def _classify(ch):
    if ch == fx.BOX:
        return "☐"
    if ch in ".\u2026_":
        return "dots"
    if ch == fx.BULLET or ch in "\u270d\ufe0f":
        return "emoji"
    if ch.isspace():
        return None
    return "text"


def type_summary(paras):
    """'text: Sakkal Majalla bold 14 pt; dots: Sakkal Majalla 9 pt'"""
    seen = OrderedDict()
    for par in paras:
        for ln in par["lines"]:
            # which characters of the line belong to a dotted blank; a full
            # stop that ends a sentence is text
            raw = "".join(r["text"] for r in ln["runs"])
            in_blank = [False] * len(raw)
            i = 0
            while i < len(raw):
                m = fx._BLANK_RE.match(raw, i)
                if m:
                    if fx._is_blank_run(m.group(0)):
                        for j in range(m.start(), m.end()):
                            in_blank[j] = True
                    i = m.end()
                else:
                    i += 1
            pos = 0
            for run in ln["runs"]:
                for ch in run["text"]:
                    cls = _classify(ch)
                    if cls == "dots" and not in_blank[pos]:
                        cls = "text"
                    pos += 1
                    if cls is None:
                        continue
                    key = (cls, run["font"], run["pt"], run["bold"])
                    seen[key] = seen.get(key, 0) + 1
    if not seen:
        return "—"
    by_cls = OrderedDict()
    for (cls, font, pt, bold), n in seen.items():
        by_cls.setdefault(cls, []).append((n, font, pt, bold))
    parts = []
    for cls, lst in by_cls.items():
        lst.sort(reverse=True)
        descs = []
        for n, font, pt, bold in lst[:2]:
            descs.append("%s%s %s pt" % (font, " bold" if bold else "", mm(pt)))
        parts.append("%s: %s" % (cls, " and ".join(descs)))
    if len(by_cls) == 1:
        return parts[0].split(": ", 1)[1]
    return "; ".join(parts)


def align_summary(paras):
    vals = []
    for par in paras:
        if par["empty"]:
            continue
        a = "%s (jc=%s)" % (par["align_on_paper"], par["jc"] or "none")
        if a not in vals:
            vals.append(a)
    return " / ".join(vals) if vals else "—"


# --------------------------------------------------------------------------
# Height estimates
# --------------------------------------------------------------------------


def par_height_pt(par, width_pt, in_styled_table):
    sp = par["spacing"]
    line = int(sp.get("line", 240 if in_styled_table else 259))
    after = int(sp.get("after", 0 if in_styled_table else 160))
    before = int(sp.get("before", 0))
    mult = line / 240.0 if sp.get("lineRule", "auto") == "auto" else None
    total = 0.0
    for ln in par["lines"]:
        runs = [r for r in ln["runs"] if r["text"].strip()] or ln["runs"]
        if runs:
            lh = max(r["pt"] * LINE_FACTOR.get(r["font"], DEFAULT_FACTOR) for r in runs)
            pt = max(r["pt"] for r in runs)
        else:
            lh, pt = 11 * DEFAULT_FACTOR, 11
        # Only words can force a wrap: dotted blanks and stretched labels are
        # drawn to fit their cell, and trailing spaces do not wrap.
        toks = fx.tokens(ln["raw"])
        letters = sum(len(s.replace(" ", "")) for k, s in toks if k == "text") + sum(1 for k, _ in toks if k in ("box", "bullet"))
        spaces = max(len(ln["raw"].replace(fx.TATWEEL, "").strip()) - letters - sum(len(s) for k, s in toks if k == "blank"), 0)
        wrapped = 1
        if width_pt and letters:
            need = (letters * CHAR_WIDTH_EM + spaces * SPACE_WIDTH_EM) * pt
            wrapped = max(1, int(math.ceil(need / max(width_pt, 1.0))))
        total += wrapped * (lh * mult if mult else line / 20.0)
    return total + (after + before) / 20.0


def table_heights(tbl):
    """(sum of saved minimum row heights in pt, estimated height in pt, per-row list)"""
    styled = tbl["style"] is not None
    rows_out = []
    for row in tbl["rows"]:
        minimum = (row["min_height_tw"] or 0) / 20.0
        content = 0.0
        for cell in row["cells"]:
            if cell["vmerge"] == "continue":
                continue
            width_pt = (cell["width_tw"] or 0) / 20.0 - 10.8  # 5.4 pt cell padding each side
            h = sum(par_height_pt(p, width_pt, styled) for p in cell["paras"])
            if cell["vmerge"] == "restart":
                h = h / 2.0
            content = max(content, h)
        rows_out.append((minimum, max(minimum, content)))
    return sum(a for a, _ in rows_out), sum(b for _, b in rows_out), rows_out


def flow(model):
    """Estimated vertical flow of the body: list of (id, what, min mm, est mm, from mm, to mm)."""
    out = []
    y = 0.0
    text_pt = model["page"]["text_width_tw"] / 20.0
    pending_empty = []

    def flush_empty():
        if pending_empty:
            h = sum(e[1] for e in pending_empty)
            ids = pending_empty[0][0] if len(pending_empty) == 1 else "%s–%s" % (pending_empty[0][0], pending_empty[-1][0])
            out.append([ids, "%d empty paragraph%s" % (len(pending_empty), "" if len(pending_empty) == 1 else "s"), None, h])
            del pending_empty[:]

    for blk in model["blocks"]:
        if blk["type"] == "p":
            h = par_height_pt(blk, text_pt, False)
            if blk["empty"] and not blk["textboxes"]:
                pending_empty.append((blk["id"], h))
                continue
            flush_empty()
            what = "«%s»" % fx.norm(blk["text"])[:60] if not blk["empty"] else "anchor of a text box"
            if blk["lrpb"]:
                what += " (Word's page-break marker is here)"
            out.append([blk["id"], what, None, h])
        else:
            flush_empty()
            minimum, est, _ = table_heights(blk)
            out.append([blk["id"], "table, %d rows%s" % (len(blk["rows"]), ", floating" if blk["floating"] else ""), minimum, est])
    flush_empty()
    res = []
    for ident, what, minimum, est in out:
        res.append((ident, what, None if minimum is None else minimum * fx.PT_MM, est * fx.PT_MM, y * fx.PT_MM, (y + est) * fx.PT_MM))
        y += est
    return res


# --------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------


def table_edges(tbl, page):
    """Distance of the table's right and left edges from the paper edges, mm."""
    width = tbl["width_tw"] or tbl["grid_sum_tw"]
    if not width:
        width = tbl["grid_sum_tw"]
    m = page["margins_tw"]
    if tbl["floating"] and tbl["floating"].get("tblpXSpec") == "center":
        over = (width - page["text_width_tw"]) / 2.0
        return fx.mm_tw(m["right"] - over), fx.mm_tw(m["left"] - over), "centred on the text area (floating table)"
    if tbl["bidiVisual"]:
        if tbl["jc"] == "right":  # end side of a right-to-left table: the left margin
            left = m["left"] + tbl["ind_tw"]
            return fx.mm_tw(page["width_tw"] - left - width), fx.mm_tw(left), "against the left margin (jc=right on a right-to-left table)"
        right = m["right"] + tbl["ind_tw"]
        return fx.mm_tw(right), fx.mm_tw(page["width_tw"] - right - width), "from the right margin, offset %s mm (tblInd %d)" % (mm(fx.mm_tw(tbl["ind_tw"])), tbl["ind_tw"])
    left = m["left"] + tbl["ind_tw"]
    return fx.mm_tw(page["width_tw"] - left - width), fx.mm_tw(left), "from the left margin"


def picture_place(pic, page, part):
    """Where the header or footer picture lands on paper (vertical values estimated)."""
    m = page["margins_mm"]
    left = m["left"] + pic["h_offset_mm"]
    right_gap = page["width_mm"] - left - pic["width_mm"]
    line_mm = 11 * 1.22 * fx.PT_MM  # one empty 11 pt line holds the anchor
    if part == "header":
        top = m["header"] + pic["v_offset_mm"]
    else:
        top = page["height_mm"] - m["footer"] - line_mm + pic["v_offset_mm"]
    return left, right_gap, top, top + pic["height_mm"]


# --------------------------------------------------------------------------
# Rendering one form
# --------------------------------------------------------------------------


def border_text(b):
    if not b:
        return "none stated"
    vals = set((v["val"], v["sz"], v["color"]) for v in b.values())
    if len(vals) == 1:
        val, sz, color = list(vals)[0]
        if val in ("none", "nil"):
            return "none"
        return "%s, %s pt, %s, on all sides and between cells" % (val, mm(int(sz or 0) / 8.0), "black" if color == "auto" else color)
    return "; ".join("%s: %s %s pt" % (k, v["val"], mm(int(v["sz"] or 0) / 8.0)) for k, v in b.items())


def render_form(code, model, rows):
    page = model["page"]
    by_loc = {}
    for r in rows:
        for loc in [r["loc"]] + list(r["value_locs"]):
            by_loc.setdefault(loc, [])
            if r["id"] not in by_loc[loc]:
                by_loc[loc].append(r["id"])
    L = []
    w = L.append
    meta = fx.FORMS[code]
    w("# Layout facts: %s" % meta["name"])
    w("")
    w("Word file: `client docs/%s`. Print sheet: %s." % (meta["file"], meta["sheet"]))
    w("")
    w("Read from the Word XML by `docs/checker/tools/build_forms.py`; do not edit by hand. "
      "Nothing here was seen rendered: this machine has no Word. A fact that depends on Word's rendering is marked %s. "
      "Conventions and units are in `README.md`; every cell and run is in `docs/checker/data/%s.json`. "
      "Ids (`T1.r2.c1`, `P2`, `P2.box`) are the ones in the Source column of `docs/checker-table.md`." % (EST, meta["slug"]))
    w("")

    # 1 source
    lrpb = [b["id"] for b in model["blocks"] if b["type"] == "p" and b["lrpb"]]
    hard = [b["id"] for b in model["blocks"] if b["type"] == "p" and b["page_break"]]
    w("## 1. Source")
    w("")
    w("| | |")
    w("|---|---|")
    w("| SHA-256 | `%s` |" % model["sha256"])
    w("| Saved by | %s, version %s (Word 2007 format) |" % (model["word"]["application"], model["word"]["app_version"]))
    w("| Created, last saved | %s, %s |" % (model["word"]["created"], model["word"]["modified"]))
    w("| Pages recorded by Word | %d (%s: file metadata, not a rendering) |" % (model["word"]["pages_recorded"], EST))
    w("| Explicit page breaks | %s |" % (", ".join(hard) if hard else "none"))
    w("| Page-break markers left by Word's last layout | %s |" % (("at " + ", ".join(lrpb)) if lrpb else "none"))
    w("")

    # 2 page
    w("## 2. Page")
    w("")
    w("A4 %s, %s × %s mm (%d × %d twips). Text area %s mm wide; body %s mm high between the top and bottom margins." % (
        page["orientation"], mm(page["width_mm"]), mm(page["height_mm"]), page["width_tw"], page["height_tw"],
        mm(page["text_width_mm"]), mm(page["body_height_mm"])))
    w("")
    w("| Margin | mm | twips |")
    w("|---|---|---|")
    for k, label in (("top", "Top"), ("right", "Right"), ("bottom", "Bottom"), ("left", "Left"), ("header", "Header distance from the top edge"), ("footer", "Footer distance from the bottom edge")):
        w("| %s | %s | %d |" % (label, mm(page["margins_mm"][k]), page["margins_tw"][k]))
    w("")

    # 3 letterhead
    w("## 3. Letterhead and footer")
    w("")
    w("Two pictures, one anchored in the header and one in the footer, printed on every page. Neither pushes the text. Shared facts are in `00-letterhead.md`.")
    w("")
    w("| | Header picture | Footer picture |")
    w("|---|---|---|")
    hp, fp = model["header"][0], model["footer"][0]
    w("| File | `docs/checker/assets/letterhead-header.png`, %d × %d px | `docs/checker/assets/letterhead-footer.jpeg`, %d × %d px |" % (hp["pixels"][0], hp["pixels"][1], fp["pixels"][0], fp["pixels"][1]))
    w("| Placed size | %s × %s mm | %s × %s mm |" % (mm(hp["width_mm"]), mm(hp["height_mm"]), mm(fp["width_mm"]), mm(fp["height_mm"])))
    w("| Height against natural proportions | %d%% (natural would be %s mm) | %d%% (natural would be %s mm) |" % (
        round(100 * hp["height_ratio_to_natural"]), mm(hp["natural_height_mm_at_this_width"]),
        round(100 * fp["height_ratio_to_natural"]), mm(fp["natural_height_mm_at_this_width"])))
    hl, hr, ht, hb = picture_place(hp, page, "header")
    fl, fr, ft, fb = picture_place(fp, page, "footer")
    w("| Anchor, horizontal | %s mm from the left edge of the text area | %s mm from the left edge of the text area |" % (mm(hp["h_offset_mm"]), mm(fp["h_offset_mm"])))
    w("| Anchor, vertical | %s mm from the top of the header paragraph | %s mm from the top of the footer paragraph |" % (mm(hp["v_offset_mm"]), mm(fp["v_offset_mm"])))
    w("| Left edge to paper edge | %s mm | %s mm |" % (mm(hl), mm(fl)))
    w("| Right edge to paper edge | %s mm | %s mm |" % (mm(hr), mm(fr)))
    w("| Top, bottom from the top of the paper (%s) | %s mm, %s mm | %s mm, %s mm%s |" % (
        EST, mm(ht), mm(hb), mm(ft), mm(fb), " (the paper ends at 297 mm)" if fb > 296.5 else ""))
    w("")

    # 4 type
    w("## 4. Type in use")
    w("")
    w("For right-to-left runs Word applies the complex-script font, size and weight; these are the values shown. Counted over the whole body, spaces left out.")
    w("")
    counts = OrderedDict()

    def count_par(par):
        for ln in par["lines"]:
            for run in ln["runs"]:
                n = len([c for c in run["text"] if not c.isspace()])
                if n:
                    key = (run["font"], run["pt"], run["bold"])
                    d = counts.setdefault(key, [0, ""])
                    d[0] += n
                    if not d[1] and run["text"].strip():
                        d[1] = run["text"].strip()[:28]
        for box in par.get("textboxes", []):
            for q in box["paras"]:
                count_par(q)

    for blk in model["blocks"]:
        if blk["type"] == "p":
            count_par(blk)
        else:
            for row in blk["rows"]:
                for cell in row["cells"]:
                    for par in cell["paras"]:
                        count_par(par)
    w("| Font | Size | Weight | Characters | First use |")
    w("|---|---|---|---|---|")
    for (font, pt, bold), (n, ex) in sorted(counts.items(), key=lambda kv: -kv[1][0]):
        w("| %s | %s pt | %s | %d | %s |" % (font, mm(pt), "bold" if bold else "regular", n, esc(show(ex))))
    w("")

    # 5 glyphs
    w("## 5. Glyphs and drawn shapes")
    w("")
    for line in glyph_lines(model):
        w("- " + line)
    w("")

    # 6 block order
    w("## 6. Order of blocks, with the page estimate")
    w("")
    w("Heights: \"at least\" is the sum of the row heights saved in the file; \"about\" adds line heights assumed from the type sizes (see `README.md`). "
      "The running position is measured from the top of the body area, which is %s mm high. All of it is %s." % (mm(page["body_height_mm"]), EST))
    w("")
    w("| Block | What | At least | About | From, to | Page (%s) |" % EST)
    w("|---|---|---|---|---|---|")
    body = page["body_height_mm"]
    fl_rows = flow(model)
    for ident, what, minimum, est, y0, y1 in fl_rows:
        p0, p1 = int(y0 // body) + 1, int(max(y1 - 0.01, 0) // body) + 1
        w("| %s | %s | %s | %s mm | %s to %s mm | %s |" % (
            ident, esc(what), ("%s mm" % mm(minimum)) if minimum is not None else "—", mm(est), mm(y0), mm(y1),
            ("%d" % p0) if p0 == p1 else "%d to %d" % (p0, p1)))
    total = fl_rows[-1][5] if fl_rows else 0
    w("")
    w("Total about %s mm, which is %.1f body heights. %s" % (mm(total), total / body, fn.PAGE_NOTE[code]))
    w("")

    # 7 text boxes and paragraphs
    w("## 7. Text boxes")
    w("")
    any_box = False
    for blk in model["blocks"]:
        if blk["type"] != "p":
            continue
        for bi, box in enumerate(blk["textboxes"], 1):
            any_box = True
            loc = "%s.box%s" % (blk["id"], "" if len(blk["textboxes"]) == 1 else bi)
            g = box["geometry"]
            w("**%s** (row %s), anchored to paragraph %s." % (loc, ", ".join(by_loc.get(loc, ["—"])), blk["id"]))
            w("")
            w("- Size %s × %s mm (%s × %s pt). Left edge %s mm (%s pt) from the left edge of the text area, which puts it %s mm from the left paper edge and %s mm from the right. Top %s mm (%s pt) below the top of its anchor paragraph (position on the page %s)." % (
                mm(g["width_mm"]), mm(g["height_mm"]), g["width_pt"], g["height_pt"], mm(g["left_mm"]), g["left_pt"],
                mm(page["margins_mm"]["left"] + g["left_mm"]), mm(page["width_mm"] - page["margins_mm"]["left"] - g["left_mm"] - g["width_mm"]),
                mm(g["top_mm"]), g["top_pt"], EST))
            sh = box.get("shadow") or {}
            w("- Box: fill %s, outline %s. Shadow: %s." % (
                (box.get("fillcolor") or "none").split(" ")[0], "none" if box.get("stroked") == "f" else (box.get("strokecolor") or "default"),
                ("colour %s, opacity %s, offset %s" % (sh.get("color", "").split(" ")[0], sh.get("opacity"), sh.get("offset"))) if sh.get("on") == "t" else "none"))
            for qi, q in enumerate(box["paras"], 1):
                if q["empty"]:
                    continue
                sp = q["spacing"]
                w("- Line %d: «%s». %s; paragraph fill %s; line spacing %s; %s." % (
                    qi, esc(show(q["text"])), align_summary([q]), q["fill"] or "none",
                    ("%.2f lines" % (int(sp.get("line", 240)) / 240.0)) if sp.get("lineRule", "auto") == "auto" else sp.get("line"),
                    type_summary([q])))
                hl_runs = [r for ln in q["lines"] for r in ln["runs"] if r.get("highlight")]
                if hl_runs:
                    w("- Part of that line carries a %s highlight: «%s»." % (hl_runs[0]["highlight"], esc(show("".join(r["text"] for r in hl_runs)))))
            w("")
    if not any_box:
        w("None.")
        w("")

    w("## 8. Paragraphs outside the tables")
    w("")
    w("| Id | Rows | Alignment on paper (XML) | Indent, spacing | Mark | Text, raw | Type |")
    w("|---|---|---|---|---|---|---|")
    run_empty = []

    def flush_empty():
        if run_empty:
            ident = run_empty[0] if len(run_empty) == 1 else "%s–%s" % (run_empty[0], run_empty[-1])
            w("| %s | — | — | — | — | (%d empty paragraph%s) | — |" % (ident, len(run_empty), "" if len(run_empty) == 1 else "s"))
            del run_empty[:]

    for blk in model["blocks"]:
        if blk["type"] != "p":
            flush_empty()
            w("| %s | | | | | (table, section 9) | |" % blk["id"])
            continue
        if blk["empty"]:
            if blk["textboxes"]:
                flush_empty()
                w("| %s | — | — | — | — | (empty; anchors a text box) | — |" % blk["id"])
            else:
                run_empty.append(blk["id"])
            continue
        flush_empty()
        ind = ", ".join("%s %s mm" % (k, mm(fx.mm_tw(v))) for k, v in blk["ind"].items()) or "none"
        sp = blk["spacing"]
        spc = []
        if "line" in sp:
            spc.append("line %.2f" % (int(sp["line"]) / 240.0))
        if "after" in sp:
            spc.append("after %s pt" % mm(int(sp["after"]) / 20.0))
        lab = blk["label"]
        mark = "—"
        if lab:
            mark = ("number «%s»" % lab["text"]) if lab["kind"] == "number" else "bullet %s in %s" % ("/".join(lab["codepoints"]), lab["font"])
        if blk["lrpb"]:
            mark = (mark + "; " if mark != "—" else "") + "Word's page-break marker"
        w("| %s | %s | %s | indent %s; %s | %s | %s | %s |" % (
            blk["id"], ", ".join(by_loc.get(blk["id"], ["—"])), align_summary([blk]), ind, ", ".join(spc) or "default spacing",
            mark, esc(show(blk["text"])), type_summary([blk])))
    flush_empty()
    w("")

    # 9 tables
    w("## 9. Tables")
    w("")
    w("Columns and cells are listed in file order, which is right to left on paper: column 1 and cell c1 are the rightmost. "
      "A minimum height is the row height saved in the file; the printed row is at least that high.")
    w("")
    for blk in model["blocks"]:
        if blk["type"] != "tbl":
            continue
        right, left, how = table_edges(blk, page)
        width = blk["width_tw"] or blk["grid_sum_tw"]
        w("### %s: %d columns, %d rows" % (blk["id"], len(blk["grid_tw"]), len(blk["rows"])))
        w("")
        w("- Width %s mm (%d twips), %s layout, %s." % (mm(fx.mm_tw(width)), width, blk["layout"], "right to left" if blk["bidiVisual"] else "left to right"))
        w("- Position: %s. Right edge %s mm from the right paper edge, left edge %s mm from the left (%s within about 2 mm: Word's cell-margin rule is not in the file)." % (how, mm(right), mm(left), EST))
        if blk["floating"]:
            f = blk["floating"]
            w("- Floating table: anchored to the text, %s mm (%s twips) from its anchor vertically, text kept %s mm away on each side. Where it lands on the page is %s." % (
                mm(fx.mm_tw(int(f.get("tblpY", 0)))), f.get("tblpY", "0"), mm(fx.mm_tw(int(f.get("leftFromText", 0)))), EST))
        if blk["borders"]:
            w("- Borders: %s." % border_text(blk["borders"]))
        elif blk["style"]:
            w("- Borders: from the table style `%s`: single, 0.5 pt, black, on all sides and between cells." % blk["style"])
        else:
            w("- Borders: none (no border is set on the table and it has no table style).")
        w("- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).")
        w("")
        w("| Column | " + " | ".join(str(i) for i in range(1, len(blk["grid_tw"]) + 1)) + " |")
        w("|---|" + "---|" * len(blk["grid_tw"]))
        w("| mm | " + " | ".join(mm(v) for v in blk["grid_mm"]) + " |")
        w("| twips | " + " | ".join(str(v) for v in blk["grid_tw"]) + " |")
        w("")
        w("| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |")
        w("|---|---|---|---|---|---|---|---|---|")
        blank_run = None
        for ri, row in enumerate(blk["rows"], 1):
            sig = tuple(show(fx.cell_text(c)) for c in row["cells"])
            only_blank = all(c and not fx.words(fx.cell_text(cell)) for c, cell in zip(sig, row["cells"])) and len(row["cells"]) > 1
            if only_blank and blank_run and blank_run[1] == sig:
                blank_run[2] = ri
                continue
            if blank_run and blank_run[2] > blank_run[0]:
                w("| %s.r%d to r%d | | | | | | (%d more rows identical to r%d) | | |" % (blk["id"], blank_run[0] + 1, blank_run[2], blank_run[2] - blank_run[0], blank_run[0]))
            blank_run = [ri, sig, ri] if only_blank else None
            for cell in row["cells"]:
                extras = []
                if cell["vmerge"] == "restart":
                    extras.append("merged down, starts here")
                elif cell["vmerge"] == "continue":
                    extras.append("merged with the cell above")
                extras.append("fill %s" % cell["fill"] if cell["fill"] else "no fill")
                extras.append({"center": "middle"}.get(cell["valign"], cell["valign"]))
                if cell["borders"]:
                    extras.append("borders " + ", ".join("%s %s" % (k, "none" if v["val"] in ("nil", "none") else "%s %s pt" % (v["val"], mm(int(v["sz"] or 0) / 8.0))) for k, v in cell["borders"].items()))
                content = []
                for par in cell["paras"]:
                    if par["empty"] and not par["shapes"]:
                        continue
                    lab = par["label"]
                    pre = ""
                    if lab and lab["kind"] == "number":
                        pre = "[%s] " % lab["text"]
                    elif lab:
                        pre = "[bullet] "
                    content.append(pre + show(par["text"]))
                    for shp in par["shapes"]:
                        g = shp["geometry"]
                        content.append("(drawn %s %s × %s mm, outline %s %s, left edge %s mm from the left edge of the cell's text area)" % (
                            shp["kind"], mm(g["width_mm"]), mm(g["height_mm"]), shp.get("strokecolor"), shp.get("strokeweight"), mm(g["left_mm"])))
                span = "%d" % cell["col_from"] if cell["col_from"] == cell["col_to"] else "%d–%d" % (cell["col_from"], cell["col_to"])
                w("| %s | %s | %s mm | %s | %s | %s | %s | %s | %s |" % (
                    cell["id"], span, mm(fx.mm_tw(cell["width_tw"] or 0)),
                    ("%s mm" % mm(fx.mm_tw(row["min_height_tw"]))) if row["min_height_tw"] else "—",
                    "; ".join(extras), ", ".join(by_loc.get(cell["id"], [])) or "—",
                    esc(" ¶ ".join(content)) or "(empty)", align_summary(cell["paras"]), type_summary(cell["paras"])))
        if blank_run and blank_run[2] > blank_run[0]:
            w("| %s.r%d to r%d | | | | | | (%d more rows identical to r%d) | | |" % (blk["id"], blank_run[0] + 1, blank_run[2], blank_run[2] - blank_run[0], blank_run[0]))
        w("")

    # 10 options
    w("## 10. Options: which side the ☐ sits")
    w("")
    w("\"Before\" means the ☐ is typed before its label, so it prints on the label's right; \"after\" prints on its left. Options are separated by runs of spaces, not tabs or cells, so their exact spacing is %s; order and side are facts." % EST)
    w("")
    w("| Row | Label | ☐ side | Options |")
    w("|---|---|---|---|")
    for r in rows:
        opts = [i for i in r["items"] if i["kind"] == "option"]
        if not opts:
            continue
        sides = []
        for i in opts:
            s = i.get("side")
            if s not in sides:
                sides.append(s)
        side_txt = {"before": "before", "after": "after", "oval": "drawn oval, no ☐", "none": "none"}
        w("| %s | %s | %s | %d%s |" % (r["id"], esc(r["text"]), " / ".join(side_txt.get(s, str(s)) for s in sides),
                                    sum(1 for i in opts if not i.get("free")), (", plus %d dotted line%s without ☐" % (sum(1 for i in opts if i.get("free")), "" if sum(1 for i in opts if i.get("free")) == 1 else "s")) if any(i.get("free") for i in opts) else ""))
    w("")

    # 11 notes
    w("## 11. Notes for builders")
    w("")
    for line in fn.FORM_NOTES[code]:
        w("- " + line)
    w("")
    w("## 12. What is estimated on this page")
    w("")
    for line in fn.ESTIMATED:
        w("- " + line)
    w("")
    return "\n".join(L)


def glyph_lines(model):
    box_fonts = OrderedDict()
    ovals = []
    emoji = OrderedDict()
    bullets = OrderedDict()
    tatweel = 0

    def scan(par, where):
        nonlocal tatweel
        lab = par.get("label")
        if lab and lab["kind"] == "bullet":
            key = ("/".join(lab["codepoints"]), lab["font"])
            bullets[key] = bullets.get(key, 0) + 1
        for ln in par["lines"]:
            tatweel += ln["raw"].count(fx.TATWEEL)
            for run in ln["runs"]:
                n = run["text"].count(fx.BOX)
                if n:
                    key = (run["font"], run["pt"])
                    box_fonts[key] = box_fonts.get(key, 0) + n
                for ch in run["text"]:
                    if ch == fx.BULLET or ch == "\u270d":
                        key = (ch, "U+%04X" % ord(ch), run["font"], run["pt"])
                        emoji[key] = emoji.get(key, 0) + 1
        for shp in par["shapes"]:
            ovals.append((where, shp))

    for blk in model["blocks"]:
        if blk["type"] == "p":
            scan(blk, blk["id"])
            for box in blk["textboxes"]:
                for q in box["paras"]:
                    scan(q, blk["id"])
        else:
            for row in blk["rows"]:
                for cell in row["cells"]:
                    for par in cell["paras"]:
                        scan(par, cell["id"])
    out = []
    total = sum(box_fonts.values())
    if total:
        out.append("Tick box: ☐ (U+2610), %d in all, as text characters: %s." % (total, "; ".join("%d set in %s %s pt" % (n, f, mm(pt)) for (f, pt), n in box_fonts.items())))
    else:
        out.append("No ☐ in this file.")
    for where, shp in ovals:
        g = shp["geometry"]
        out.append("Drawn %s in %s: %s × %s mm, outline %s %s, no fill; left edge %s mm from the left edge of the cell's text area, top %s mm below the top of its line. It stands where a ☐ would." % (
            shp["kind"], where, mm(g["width_mm"]), mm(g["height_mm"]), shp.get("strokecolor"), shp.get("strokeweight"), mm(g["left_mm"]), mm(g["top_mm"])))
    for (ch, cp, font, pt), n in emoji.items():
        out.append("Emoji %s (%s), %d, in runs set in %s %s pt. That font has no such glyph, so Word substitutes one; the program needs a local glyph or a drawn mark." % (ch, cp, n, font, mm(pt)))
    for (cp, font), n in bullets.items():
        out.append("List bullet %s in %s on %d paragraphs (a round dot in Word's Symbol font, generated by the list, not typed)." % (cp, font, n))
    out.append("Stretching character (tatweel, U+0640): %d. It is part of his label strings and prints as typed; screens drop it." % tatweel)
    return out


# --------------------------------------------------------------------------
# Shared pages
# --------------------------------------------------------------------------


def render_letterhead(models):
    L = []
    w = L.append
    w("# Layout facts: letterhead and footer")
    w("")
    w("Written by `docs/checker/tools/build_forms.py`. The six Word files carry the same two pictures, byte for byte; they place them in two ways, one for the worker form and one for the five client forms.")
    w("")
    hp = models["W"]["header"][0]
    fp = models["W"]["footer"][0]
    w("| | Header picture | Footer picture |")
    w("|---|---|---|")
    w("| Copy for builders | `docs/checker/assets/letterhead-header.png` | `docs/checker/assets/letterhead-footer.jpeg` |")
    w("| Inside each .docx | `word/media/image1.png` | `word/media/image2.jpeg` |")
    w("| Pixels | %d × %d | %d × %d |" % (hp["pixels"][0], hp["pixels"][1], fp["pixels"][0], fp["pixels"][1]))
    w("| SHA-256 | `%s` | `%s` |" % (hp["media_sha256"][:16] + "…", fp["media_sha256"][:16] + "…"))
    w("| Words in the picture, read by eye | %s | %s |" % (mapping.LETTERHEAD_TEXT, mapping.FOOTER_TEXT))
    w("| Cropping | none | none |")
    w("| Wrapping | none: in front of the text, nothing is pushed | the same |")
    w("")
    w("## Placement per form")
    w("")
    w("Horizontal offsets are from the left edge of the text area; vertical offsets from the top of the header or footer paragraph. "
      "Positions from the paper edges follow from the margins; the vertical ones are %s (they assume one empty 11 pt line in the header and footer, as in the file)." % EST)
    w("")
    w("| Form | Picture | Placed size | Of natural height | Offset h, v | Left, right gap to paper edge | Top, bottom from top of paper (%s) |" % EST)
    w("|---|---|---|---|---|---|---|")
    for code, model in models.items():
        for part in ("header", "footer"):
            pic = model[part][0]
            left, right, top, bottom = picture_place(pic, model["page"], part)
            w("| %s | %s | %s × %s mm | %d%% | %s, %s mm | %s, %s mm | %s, %s mm |" % (
                code, part, mm(pic["width_mm"]), mm(pic["height_mm"]), round(100 * pic["height_ratio_to_natural"]),
                mm(pic["h_offset_mm"]), mm(pic["v_offset_mm"]), mm(left), mm(right), mm(top), mm(bottom)))
    w("")
    w("## What a builder needs to know")
    w("")
    for line in fn.LETTERHEAD_NOTES:
        w("- " + line)
    w("")
    return "\n".join(L)


def render_differences(models, all_rows):
    L = []
    w = L.append
    w("# Differences between the forms, and the Checker's findings")
    w("")
    w("Written by `docs/checker/tools/build_forms.py` from the Word XML; the K list is the Checker's and lives in `docs/checker/tools/form_notes.py`.")
    w("")
    w("One shared print component for the five client sheets will erase what is listed here unless it takes each sheet's own strings. "
      "Print reproduces each Word file as it is, slips included; the only corrections in force are those of scope A8.")
    w("")
    w("## 1. Findings not in scope section 7")
    w("")
    w("| Id | Finding | Where |")
    w("|---|---|---|")
    for kid, text, where in fn.FINDINGS:
        w("| %s | %s | %s |" % (kid, text, where))
    w("")

    client = ["B", "OR", "OC", "HR", "HC"]
    w("## 2. The same label on the five client forms")
    w("")
    w("A row is listed when the label is not on all five forms, or when its options or blank differ between forms. `—` means the form does not have it. "
      "Cell contents are the options or blank as in `docs/checker-table.md`, shortened to the count when the list is long.")
    w("")
    table = OrderedDict()
    for code in client:
        seen_here = {}
        for r in all_rows[code]:
            if r["kind"] in ("title", "number", "date", "signature", "static") or r["text"] == "—":
                continue
            key = mapping.strip_label(r["text"])
            n = seen_here.get(key, 0)
            seen_here[key] = n + 1
            k2 = key if n == 0 else "%s (occurrence %d on the form)" % (key, n + 1)
            table.setdefault(k2, OrderedDict())[code] = (r["id"], r["text"], rw.items_cell(r), r["kind"])
    w("| Label | " + " | ".join(client) + " |")
    w("|---|" + "---|" * len(client))
    for key, per in table.items():
        cells = []
        vals = set()
        for code in client:
            if code not in per:
                cells.append("—")
                vals.add(None)
                continue
            rid, text, items, kind = per[code]
            shown = items
            if len(items) > 60:
                shown = "%d options" % items.count("[")
            written = "" if mapping.strip_label(text) == text else " as «%s»" % text
            cells.append("%s%s: %s" % (rid, written, shown))
            vals.add((text, items))
        if len(vals) > 1:
            w("| %s | %s |" % (esc(key), " | ".join(esc(c) for c in cells)))
    w("")

    w("## 3. Lists of services")
    w("")
    w("| Form | Row | Heading above | Options with ☐ | Of which blank | Dotted lines without ☐ | ☐ side |")
    w("|---|---|---|---|---|---|---|")
    for code in client:
        for r in all_rows[code]:
            if "options-without-label" not in r["flags"]:
                continue
            opts = [i for i in r["items"] if i["kind"] == "option"]
            sides = sorted(set(i.get("side") for i in opts if i.get("side") in ("before", "after")))
            w("| %s | %s | %s | %d | %d | %d | %s |" % (
                code, r["id"], r["section"], sum(1 for i in opts if not i.get("free")),
                sum(1 for i in opts if not i.get("free") and i["text"] == fx.BLANK_MARK),
                sum(1 for i in opts if i.get("free")), " and ".join(sides)))
    w("")

    w("## 4. Numbers Word generates, and the slips")
    w("")
    w("The section and item numbers are not typed: Word's list numbering produces them, and this table is computed from `numbering.xml` (%s: not seen rendered). Print shows them as listed, slips included." % EST)
    w("")
    w("| Form | Section numbers, in order | Item numbers, per table | Slips |")
    w("|---|---|---|---|")
    for code in fx.FORMS:
        heads, items, slips = [], OrderedDict(), []
        for r in all_rows[code]:
            if not r.get("number"):
                continue
            if r["kind"] == "heading" and "group-label" not in r["flags"]:
                heads.append(r["number"])
            else:
                items.setdefault(r.get("table") or "body", []).append(r["number"].rstrip("."))
            if "numbering-slip" in r["flags"]:
                slips.append("%s «%s» prints «%s»" % (r["id"], r["text"], r["number"]))
        w("| %s | %s | %s | %s |" % (code, " ".join(heads) or "none", "; ".join("%s: %s" % (k, " ".join(v)) for k, v in items.items()) or "none", "; ".join(slips) or "none"))
    w("")

    w("## 5. Layout differences between sibling files")
    w("")
    w("| Form | Margins top, right, bottom, left (mm) | Tables: columns, width mm, floating | Empty paragraphs between blocks | Title box: width × height, left offset (mm) |")
    w("|---|---|---|---|---|")
    for code, model in models.items():
        pm = model["page"]["margins_mm"]
        tabs = []
        empties = []
        run = 0
        for blk in model["blocks"]:
            if blk["type"] == "tbl":
                empties.append(str(run))
                run = 0
                tabs.append("%s %d, %s%s" % (blk["id"], len(blk["grid_tw"]), mm(fx.mm_tw(blk["width_tw"] or blk["grid_sum_tw"])), ", floating" if blk["floating"] else ""))
            elif blk["empty"] and not blk["textboxes"]:
                run += 1
            else:
                run = 0
        empties.append(str(run))
        boxes = []
        for blk in model["blocks"]:
            if blk["type"] == "p":
                for box in blk["textboxes"]:
                    g = box["geometry"]
                    boxes.append("%s × %s, %s" % (mm(g["width_mm"]), mm(g["height_mm"]), mm(g["left_mm"])))
        w("| %s | %s, %s, %s, %s | %s | %s | %s |" % (code, mm(pm["top"]), mm(pm["right"]), mm(pm["bottom"]), mm(pm["left"]),
                                              "; ".join(tabs), " · ".join(empties) + " (before each table, then after the last)", "; ".join(boxes)))
    w("")
    return "\n".join(L)


def main(argv):
    for d in (FORMS_DIR, DATA_DIR, ASSETS_DIR):
        if not os.path.isdir(d):
            os.makedirs(d)
    models, all_rows = OrderedDict(), OrderedDict()
    for code in fx.FORMS:
        model = fx.load_form(code)
        rows = rw.derive(model)
        mapping.annotate(code, rows, model)
        models[code], all_rows[code] = model, rows

    # assets: the same two pictures in all six files
    hdr = set(m["header"][0]["media_sha256"] for m in models.values())
    ftr = set(m["footer"][0]["media_sha256"] for m in models.values())
    if len(hdr) != 1 or len(ftr) != 1:
        sys.stderr.write("the six files do not share one header and one footer picture\n")
        return 1
    for target, name in ((models["W"]["header"][0]["media"], "letterhead-header.png"), (models["W"]["footer"][0]["media"], "letterhead-footer.jpeg")):
        with open(os.path.join(ASSETS_DIR, name), "wb") as fh:
            fh.write(fx.media_bytes("W", target))

    for code, model in models.items():
        slug = fx.FORMS[code]["slug"]
        data = OrderedDict()
        data["about"] = ("Extracted from client docs/%s by docs/checker/tools/build_forms.py. Lengths: _tw twips (1/1440 inch), _mm millimetres, _pt points, _emu EMU (1/36000 mm). "
                         "Cells are in file order: c1 is the rightmost on paper. 'rows' lists the checker-table rows with the cells they come from." % fx.FORMS[code]["file"])
        data["model"] = model
        data["rows"] = [OrderedDict(id=r["id"], kind=r["kind"], text=r["text"], label_at=r["loc"], value_at=r["value_locs"],
                                    blank_before_options=bool(r["lead_blank"]), generated_number=r.get("number"),
                                    items=[OrderedDict((k, v) for k, v in it.items()) for it in r["items"]], flags=r["flags"]) for r in all_rows[code]]
        with open(os.path.join(DATA_DIR, slug + ".json"), "w", encoding="utf8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        with open(os.path.join(FORMS_DIR, slug + ".md"), "w", encoding="utf8") as fh:
            fh.write(render_form(code, model, all_rows[code]))
        print("wrote %s.md and %s.json" % (slug, slug))
    with open(os.path.join(FORMS_DIR, "00-letterhead.md"), "w", encoding="utf8") as fh:
        fh.write(render_letterhead(models))
    with open(os.path.join(FORMS_DIR, "differences.md"), "w", encoding="utf8") as fh:
        fh.write(render_differences(models, all_rows))
    print("wrote 00-letterhead.md, differences.md and the two pictures in assets/")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
