"""Turn a form model (formxml.load_form) into checker rows, in form order.

One row per printed element that carries a label or a blank: the title in its
text box, the header number, the date, each section heading, each field (with
its options or its blank, as written, in order), each fixed text, each
signature line. Options are items inside a row, not rows.

The strings are taken from the XML; nothing is typed by hand here. What is
written by hand is only the mapping layer at the bottom (screen, sheet, owner,
notes), which follows docs/scope.md and CLAUDE.md.
"""

import re
import unicodedata

import formxml as fx

BLANK = fx.BLANK_MARK


def _has_letters(s):
    return any(unicodedata.category(c)[0] == "L" for c in s)


# --------------------------------------------------------------------------
# Reading one line
# --------------------------------------------------------------------------


def parse_line(raw):
    """Return a list of elements for one raw line:
    ('text', s)
    ('blank', label_or_None, pattern)
    ('options', label_or_None, lead_blank_pattern_or_None, [option dicts], flags)
    ('bullets', [s, ...])
    An option dict: text (may be ……), side ('before' = box written before the
    label, so on its right on paper; 'after' = on its left; 'none' = no box).
    """
    toks = fx.tokens(raw)
    if not toks:
        return []
    kinds = [k for k, _ in toks]

    if "bullet" in kinds:
        items, cur = [], None
        for k, s in toks:
            if k == "bullet":
                if cur is not None:
                    items.append(cur)
                cur = ""
            elif cur is not None:
                cur = (cur + " " + (BLANK if k == "blank" else s)).strip()
        if cur is not None:
            items.append(cur)
        return [("bullets", items)]

    if "box" in kinds:
        return [_parse_options(toks)]

    out = []
    seg = None  # [label, parts, has_blank, plain]

    def close():
        if seg is None:
            return
        label, parts, has_blank = seg
        if has_blank:
            out.append(("blank", label, " ".join(parts)))
        elif label is not None:
            out.append(("text", label))
        elif parts:
            out.append(("text", " ".join(parts)))

    for k, s in toks:
        if k == "blank":
            if seg is None:
                seg = [None, [], False]
            if not (seg[1] and seg[1][-1] == BLANK):
                seg[1].append(BLANK)
            seg[2] = True
        else:
            if not _has_letters(s):
                # decoration of a blank: "/", "(01):", "/100"
                if seg is None:
                    seg = [None, [], False]
                seg[1].append(s)
            elif s.endswith(":") and not (seg is not None and seg[2] is False and seg[0] is None and not seg[1]):
                close()
                seg = [s, [], False]
            elif s.endswith(":"):
                seg = [s, [], False]
            elif seg is not None and seg[2]:
                seg[1].append(s)  # suffix after a blank: دج, م2, /H/F
            else:
                close()
                seg = [s, [], False]
                close()
                seg = None
    close()
    return out


def _parse_options(toks):
    first_box = [k for k, _ in toks].index("box")
    pre = toks[:first_box]
    label = None
    lead = None
    opts = []
    flags = []
    mode = "before" if not pre else "after"

    def group_text(group):
        parts = []
        for k, s in group:
            if k == "blank":
                if parts and parts[-1] == BLANK:
                    continue
                parts.append(BLANK)
            else:
                parts.append(s)
        return " ".join(parts).strip()

    if mode == "before":
        groups, cur = [], None
        for k, s in toks:
            if k == "box":
                if cur is not None:
                    groups.append(cur)
                cur = []
            else:
                cur.append((k, s))
        groups.append(cur)
        for g in groups:
            opts.append(dict(text=group_text(g) or BLANK, side="before"))
    else:
        groups, cur = [], []
        for k, s in toks:
            if k == "box":
                groups.append(cur)
                cur = []
            else:
                cur.append((k, s))
        trailing = cur
        first = groups[0]
        gk = [k for k, _ in first]
        if gk == ["text", "blank", "text"] and first[0][1].endswith(":"):
            label, lead, first = first[0][1], BLANK, first[2:]
        elif gk == ["blank", "text"]:
            lead, first = BLANK, first[1:]
        groups[0] = first
        for g in groups:
            opts.append(dict(text=group_text(g) or BLANK, side="after"))
        if trailing:
            tk = [k for k, _ in trailing]
            if "text" in tk:
                opts.append(dict(text=group_text(trailing), side="none"))
                flags.append("label-without-box")
            else:
                opts.append(dict(text=BLANK, side="none", free=True))
    return ("options", label, lead, opts, flags)


def analyse_cell(cell):
    """('empty'|'label'|'value', elements, label_lines)"""
    elems = []
    for par in cell["paras"]:
        for ln in par["lines"]:
            for el in parse_line(ln["raw"]):
                elems.append((el, par))
    ovals = [s for par in cell["paras"] for s in par["shapes"] if s["kind"] == "oval"]
    if ovals:
        # worker form: «نعم … لا» with two drawn ovals and no ☐
        raw = fx.cell_text(cell).replace(fx.TATWEEL, "")
        labels = [x.strip() for x in re.split(r"\s{2,}", raw) if x.strip()]
        opts = [dict(text=x, side="oval") for x in labels]
        return "value", [(("options", None, None, opts, ["drawn-ovals"]), cell["paras"][0])], []
    if not elems:
        return "empty", [], []
    if all(el[0] == "text" for el, _ in elems):
        return "label", elems, [(el[1], par) for el, par in elems]
    return "value", elems, []


# --------------------------------------------------------------------------
# Rows
# --------------------------------------------------------------------------


def _kind_for(text, default):
    t = text.strip()
    if t.startswith("رقم التسجيل"):
        return "number"
    if t.startswith("التاريخ") or t.startswith("حررت"):
        return "date"
    if t.startswith("إمضاء") or t.startswith("الإمضاء"):
        return "signature"
    return default


def new_row(form, kind, text, loc, **kw):
    row = dict(form=form, kind=kind, text=text, loc=loc, value_locs=[], items=[], lead_blank=None,
               number=None, num_id=None, notes=[], flags=[], section=kw.pop("section", None),
               part=kw.pop("part", None), table=kw.pop("table", None))
    row.update(kw)
    return row


def derive(model):
    form = model["form"]
    rows = []
    state = dict(section=None, part="registration" if form == "W" else "form", articles=False,
                 article_row=None, after_articles=False)

    def emit(row):
        row["section"] = state["section"]
        row["part"] = state["part"]
        rows.append(row)
        return row

    for blk in model["blocks"]:
        if blk["type"] == "p":
            _derive_paragraph(form, blk, state, emit)
        else:
            _derive_table(form, blk, state, emit)

    # ids
    for i, row in enumerate(rows, 1):
        row["id"] = "%s-%03d" % (form, i)
    _number_notes(rows)
    return rows


def _derive_paragraph(form, blk, state, emit):
    for bi, box in enumerate(blk["textboxes"], 1):
        text = " / ".join(fx.norm(p["text"]) for p in box["paras"] if not p["empty"])
        loc = "%s.box%s" % (blk["id"], "" if len(blk["textboxes"]) == 1 else bi)
        if form == "W" and "النظام الداخلي" in text:
            state["part"] = "regulations"
            state["articles"] = True
            state["section"] = None
        emit(new_row(form, "title", text, loc))
    if blk["empty"]:
        return
    label = blk.get("label")
    for ln in blk["lines"]:
        raw = ln["raw"]
        if not raw.strip():
            continue
        plain = fx.norm(raw)
        if state["articles"]:
            if plain.startswith("✍"):
                state["articles"] = False
                state["article_row"] = None
            elif plain.startswith("المادة"):
                state["article_row"] = emit(new_row(form, "static", plain, blk["id"]))
                continue
            elif state["article_row"] is not None and not plain.startswith("رقم التسجيل") and not plain.startswith("التاريخ"):
                art = state["article_row"]
                art["items"].append(dict(text=plain, kind="item",
                                         marker=("bullet " + "/".join(label["codepoints"])) if label and label["kind"] == "bullet" else "line"))
                if blk["id"] not in art["value_locs"]:
                    art["value_locs"].append(blk["id"])
                continue
        for el in parse_line(raw):
            if el[0] == "text":
                emit(new_row(form, _kind_for(el[1], "static"), el[1], blk["id"]))
            elif el[0] == "blank":
                text = el[1] if el[1] is not None else "—"
                row = emit(new_row(form, _kind_for(text, "field"), text, blk["id"]))
                row["items"].append(dict(text=el[2], kind="blank"))
            elif el[0] == "options":
                row = emit(new_row(form, "choice", el[1] or "—", blk["id"]))
                row["lead_blank"] = el[2]
                row["items"].extend(dict(text=o["text"], kind="option", side=o["side"]) for o in el[3])
            elif el[0] == "bullets":
                row = emit(new_row(form, "static", "—", blk["id"]))
                row["items"].extend(dict(text=s, kind="item", marker="🔹") for s in el[1])


def _derive_table(form, blk, state, emit):
    ncols = len(blk["grid_tw"])
    column_rows = None  # rows made from an all-label table row, waiting for blank rows below
    blank_lines = 0

    def close_columns():
        if column_rows and blank_lines > 1:
            column_rows[0]["notes"].append("%d identical blank lines under these column headings" % blank_lines)

    for trow in blk["rows"]:
        cells = trow["cells"]
        infos = [analyse_cell(c) for c in cells]

        # full-width shaded heading
        if len(cells) == 1 and cells[0]["col_to"] - cells[0]["col_from"] + 1 == ncols and cells[0]["fill"] and infos[0][0] == "label":
            close_columns()
            column_rows, blank_lines = None, 0
            par = cells[0]["paras"][0]
            text = " / ".join(t for t, _ in infos[0][2])
            state["section"] = text
            row = emit(new_row(form, "heading", text, cells[0]["id"], table=blk["id"]))
            _take_number(row, par)
            continue

        # blank-only row under column headings
        if column_rows is not None and len(cells) == len(column_rows) and all(
                i[0] == "value" and all(el[0] == "blank" and el[1] is None for el, _ in i[1]) for i in infos):
            blank_lines += 1
            if blank_lines == 1:
                for crow, cell, info in zip(column_rows, cells, infos):
                    crow["items"].append(dict(text=" ".join(el[2] for el, _ in info[1]), kind="blank"))
                    crow["value_locs"].append(cell["id"])
            continue
        close_columns()
        column_rows, blank_lines = None, 0

        # all cells are labels: column headings (or two signature labels)
        live = [(c, i) for c, i in zip(cells, infos) if i[0] != "empty"]
        if len(live) >= 2 and all(i[0] == "label" for _, i in live) and len(live) == len(cells):
            column_rows = []
            for cell, info in live:
                text = " / ".join(t for t, _ in info[2])
                row = emit(new_row(form, _kind_for(text, "field"), text, cell["id"], table=blk["id"]))
                row["flags"].append("column-heading")
                _take_number(row, info[2][0][1])
                column_rows.append(row)
            continue

        pending = None  # list of (text, cell id, paragraph)
        merge = None
        claimed = None  # cell whose unlabelled dotted lines already belong to a row

        def flush_pending():
            for text, loc, par in pending or []:
                row = emit(new_row(form, _kind_for(text, "heading"), text, loc, table=blk["id"]))
                if row["kind"] == "heading":
                    row["flags"].append("group-label")
                _take_number(row, par)

        for cell, info in zip(cells, infos):
            ckind, elems, label_lines = info
            if ckind == "empty":
                if cell["vmerge"] == "continue":
                    continue
                if pending:
                    for text, loc, par in pending:
                        row = emit(new_row(form, _kind_for(text, "field"), text, loc, table=blk["id"]))
                        row["value_locs"].append(cell["id"])
                        row["flags"].append("empty-value-cell")
                        _take_number(row, par)
                    pending = None
                merge = None
                continue
            if ckind == "label":
                if pending:
                    flush_pending()
                numbered = [(t, par) for t, par in label_lines if par.get("label") and par["label"]["kind"] == "number"]
                if len(numbered) >= 2 and len(numbered) == len(label_lines):
                    pending = [(t, cell["id"], par) for t, par in label_lines]
                else:
                    pending = [(" / ".join(t for t, _ in label_lines), cell["id"], label_lines[0][1])]
                merge = None
                continue
            # value cell
            for el, par in elems:
                if el[0] == "text":
                    if pending:
                        flush_pending()
                        pending = None
                    row = emit(new_row(form, _kind_for(el[1], "heading"), el[1], cell["id"], table=blk["id"]))
                    if row["kind"] == "heading":
                        row["flags"].append("group-label")
                    merge = None
                elif el[0] == "blank":
                    if el[1] is None:
                        if pending:
                            for text, loc, lpar in pending:
                                row = emit(new_row(form, _kind_for(text, "field"), text, loc, table=blk["id"]))
                                row["items"].append(dict(text=el[2], kind="blank"))
                                row["value_locs"].append(cell["id"])
                                _take_number(row, lpar)
                                if len(pending) > 1:
                                    row["flags"].append("shares-blank-cell")
                            pending = None
                            claimed = cell["id"]
                            merge = None
                        elif merge is not None and merge["kind"] == "choice" and (
                                cell["id"] == merge["loc"] or cell["id"] in merge["value_locs"]):
                            # a dotted line with no box, written under or beside the options
                            merge["items"].append(dict(text=BLANK, kind="option", side="none", free=True))
                        elif claimed == cell["id"]:
                            pass  # more dotted lines in a cell already claimed
                        else:
                            row = emit(new_row(form, "field", "—", cell["id"], table=blk["id"]))
                            row["items"].append(dict(text=el[2], kind="blank"))
                            row["flags"].append("blank-without-label")
                            claimed = cell["id"]
                            merge = None
                    else:
                        if pending:
                            flush_pending()
                        pending = None
                        row = emit(new_row(form, _kind_for(el[1], "field"), el[1], cell["id"], table=blk["id"]))
                        row["items"].append(dict(text=el[2], kind="blank"))
                        row["flags"].append("label-inside-value-cell")
                        _take_number(row, par)
                        merge = None
                elif el[0] in ("options", "bullets"):
                    if el[0] == "options":
                        _, label, lead, opts, flags = el
                        items = [dict(text=o["text"], kind="option", side=o["side"], free=o.get("free", False)) for o in opts]
                    else:
                        label, lead, flags = None, None, []
                        items = [dict(text=s, kind="item", marker="🔹") for s in el[1]]
                    target = None
                    if label is not None:
                        if pending:
                            flush_pending()
                        pending = None
                        target = emit(new_row(form, "choice", label, cell["id"], table=blk["id"]))
                        target["flags"].append("label-inside-value-cell")
                        _take_number(target, par)
                    elif pending:
                        text, loc, lpar = pending[0]
                        target = emit(new_row(form, "choice" if el[0] == "options" else "static", text, loc, table=blk["id"]))
                        _take_number(target, lpar)
                        pending = None
                    elif merge is not None and merge["kind"] in ("choice", "static"):
                        target = merge
                    else:
                        target = emit(new_row(form, "choice" if el[0] == "options" else "static", "—", cell["id"], table=blk["id"]))
                        target["flags"].append("options-without-label")
                    if lead and not target["lead_blank"]:
                        target["lead_blank"] = lead
                    target["items"].extend(items)
                    for f in flags:
                        if f not in target["flags"]:
                            target["flags"].append(f)
                    if cell["id"] not in target["value_locs"] and cell["id"] != target["loc"]:
                        target["value_locs"].append(cell["id"])
                    merge = target
        if pending:
            flush_pending()
    close_columns()


def _take_number(row, par):
    lab = par.get("label") if par else None
    if lab and lab["kind"] == "number":
        row["number"] = lab["text"]
        row["num_id"] = lab["numId"]
        row["num_n"] = lab["n"]


def _number_notes(rows):
    """Say what number Word generates in front of a label, and flag slips."""
    prev_heading = None
    prev_item = {}  # table -> (num_id, n)
    for row in rows:
        if not row.get("number"):
            continue
        note = "Prints with «%s» in front, a number Word generates" % row["number"]
        if row["kind"] == "heading" and "group-label" not in row["flags"]:
            if prev_heading is not None and (row["num_id"] != prev_heading[0] or row["num_n"] != prev_heading[1] + 1):
                note += "; SLIP (F8): it follows «%s»" % prev_heading[2]
                row["flags"].append("numbering-slip")
            if not (prev_heading is not None and row["num_id"] != prev_heading[0]):
                prev_heading = (row["num_id"], row["num_n"], row["number"])
        else:
            key = row.get("table")
            p = prev_item.get(key)
            if p is not None and (row["num_id"] != p[0] or row["num_n"] != p[1] + 1):
                note += "; SLIP (F8): it follows «%s»" % p[2]
                row["flags"].append("numbering-slip")
            if not (p is not None and row["num_id"] != p[0]):
                prev_item[key] = (row["num_id"], row["num_n"], row["number"])
        row["notes"].insert(0, note)


# --------------------------------------------------------------------------
# Table cells for docs/checker-table.md
# --------------------------------------------------------------------------


def items_cell(row):
    """The 'Options or blank' cell. Options are numbered so that W-024.3 can
    address one; a bare …… is a free blank with no option number."""
    if not row["items"] and not row["lead_blank"]:
        return "—"
    parts = []
    if row["lead_blank"]:
        parts.append(BLANK)
    kinds = set(i["kind"] for i in row["items"])
    if kinds == {"blank"}:
        return " ".join(i["text"] for i in row["items"]) or BLANK
    n = 0
    for it in row["items"]:
        if it.get("free"):
            parts.append(BLANK)
            continue
        n += 1
        parts.append("[%d] %s" % (n, it["text"]))
    return " · ".join(parts)


def source_cell(row):
    if row["value_locs"]:
        locs = list(row["value_locs"])
        if row["text"] == "—" and row["loc"] not in locs:
            locs.insert(0, row["loc"])
            return _loc_range(locs)
        return "%s › %s" % (row["loc"], _loc_range(locs))
    return row["loc"]


def _loc_range(locs):
    if True:
        if len(locs) > 1 and all(l.rsplit(".", 1)[0] == locs[0].rsplit(".", 1)[0] for l in locs) and "." in locs[0]:
            head = locs[0].rsplit(".", 1)[0]
            tail = "%s–%s" % (locs[0].rsplit(".", 1)[1], locs[-1].rsplit(".", 1)[1])
            val = "%s.%s" % (head, tail)
        elif len(locs) > 1:
            val = "%s–%s" % (locs[0], locs[-1])
        else:
            val = locs[0]
        return val


def row_words(row):
    """The words this row claims, in order (used by the validator through the
    Markdown, and here for self-checks)."""
    out = []
    if row["text"] != "—":
        out.extend(fx.words(row["text"]))
    for it in row["items"]:
        out.extend(fx.words(it["text"]))
    return out
