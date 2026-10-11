"""Read the client's six Word forms straight from the .docx files.

Standard library only. Run every tool here with `python3 -I`.
Nothing in `client docs/` is written to: the .docx files are opened read-only
as zip archives and parsed in memory.

What this module gives the other tools:
  load_form(code)   -> a plain dict ("model") holding the page, the letterhead
                       placement and every paragraph, text box, shape, table,
                       row and cell in document order, with raw text and type.
  tokens / norm / words  -> the one text normalisation shared by the table
                       builder and the validator.
"""

import hashlib
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "v": "urn:schemas-microsoft-com:vml",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
W = "{%s}" % NS["w"]
V = "{%s}" % NS["v"]
WP = "{%s}" % NS["wp"]
A = "{%s}" % NS["a"]
R = "{%s}" % NS["r"]

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
CLIENT_DOCS = os.path.join(ROOT, "client docs")

# Order and codes follow CLAUDE.md.
FORMS = OrderedDict(
    [
        ("W", dict(file="-01- تسجيل عامل نظافة.docx", slug="01-worker", name="worker registration form", sheet="worker sheet")),
        ("B", dict(file="-01- عقد - عمارة.docx", slug="02-building-contract", name="building contract", sheet="building contract sheet")),
        ("OR", dict(file="-01- مؤسسة - طلب.docx", slug="03-org-request", name="organisation request", sheet="organisation request sheet")),
        ("OC", dict(file="-02- مؤسسة - عقد.docx", slug="04-org-contract", name="organisation contract", sheet="organisation contract sheet")),
        ("HR", dict(file="-03- سكن - طلب.docx", slug="05-home-request", name="home request", sheet="home request sheet")),
        ("HC", dict(file="-04- سكن - عقد.docx", slug="06-home-contract", name="home contract", sheet="home contract sheet")),
    ]
)

TW_MM = 25.4 / 1440.0  # 1 twip = 1/1440 inch
EMU_MM = 1.0 / 36000.0  # 1 mm = 36000 EMU
PT_MM = 25.4 / 72.0


def mm_tw(tw):
    return round(float(tw) * TW_MM, 2)


def mm_emu(emu):
    return round(float(emu) * EMU_MM, 2)


def mm_pt(pt):
    return round(float(pt) * PT_MM, 2)


def wa(el, name, default=None):
    """Attribute in the w: namespace."""
    if el is None:
        return default
    return el.get(W + name, default)


# --------------------------------------------------------------------------
# Text normalisation (shared by the table builder and the validator)
# --------------------------------------------------------------------------

TATWEEL = "ـ"
BOX = "☐"  # ☐
BULLET = "\U0001F539"  # 🔹
BLANK_MARK = "……"  # …… : how a blank is written in the table
_BLANK_RE = re.compile(r"[.…_]+")


def _is_blank_run(s):
    """A run of dots, ellipsis characters or underscores long enough to be a
    blank to fill in. «غ..الضيوف» has two dots and stays text."""
    weight = s.count(".") + s.count("_") + 3 * s.count("…")
    return weight >= 3


def tokens(raw):
    """Split one raw line into ('text', s) | ('blank', s) | ('box', s) | ('bullet', s).
    Text tokens keep his characters except the stretching character."""
    out = []
    buf = []

    def flush():
        s = "".join(buf)
        del buf[:]
        s = re.sub(r"\s+", " ", s.replace(TATWEEL, "")).strip()
        if s:
            out.append(("text", s))

    i = 0
    n = len(raw)
    while i < n:
        ch = raw[i]
        if ch == BOX:
            flush()
            out.append(("box", ch))
            i += 1
            continue
        if ch == BULLET:
            flush()
            out.append(("bullet", ch))
            i += 1
            continue
        m = _BLANK_RE.match(raw, i)
        if m and _is_blank_run(m.group(0)):
            flush()
            out.append(("blank", m.group(0)))
            i = m.end()
            continue
        if m:
            buf.append(m.group(0))
            i = m.end()
            continue
        buf.append(ch)
        i += 1
    flush()
    return out


def norm(raw):
    """His text as the table shows it: stretching character removed, every
    blank written as ……, blanks separated only by spaces merged, spaces
    collapsed. Everything else is kept exactly."""
    parts = []
    for kind, s in tokens(raw):
        if kind == "blank":
            if parts and parts[-1] == BLANK_MARK:
                continue
            parts.append(BLANK_MARK)
        else:
            parts.append(s)
    return " ".join(parts).strip()


def words(raw):
    """The comparison key: text words only, in order. Blanks, boxes, bullets
    and spacing are dropped."""
    out = []
    for kind, s in tokens(raw):
        if kind == "text":
            out.extend(s.split(" "))
    return [w for w in out if w]


# --------------------------------------------------------------------------
# Low-level parsing
# --------------------------------------------------------------------------


class Numbering(object):
    """Resolves the numbers Word generates for list paragraphs. They are not in
    the text. Counters run per abstract list unless a start override exists."""

    def __init__(self, root):
        self.abstract = {}
        self.nums = {}
        self.counters = {}
        if root is None:
            return
        for an in root.findall(W + "abstractNum"):
            levels = {}
            for lv in an.findall(W + "lvl"):
                rpr = lv.find(W + "rPr")
                fonts = rpr.find(W + "rFonts") if rpr is not None else None
                ppr = lv.find(W + "pPr")
                ind = ppr.find(W + "ind") if ppr is not None else None
                levels[wa(lv, "ilvl")] = dict(
                    start=int(wa(lv.find(W + "start"), "val", "1")),
                    fmt=wa(lv.find(W + "numFmt"), "val"),
                    text=wa(lv.find(W + "lvlText"), "val") or "",
                    font=(wa(fonts, "ascii") or wa(fonts, "cs")) if fonts is not None else None,
                    ind=dict((k.split("}")[1], v) for k, v in ind.attrib.items()) if ind is not None else {},
                )
            self.abstract[wa(an, "abstractNumId")] = levels
        for nm in root.findall(W + "num"):
            over = {}
            for lo in nm.findall(W + "lvlOverride"):
                so = lo.find(W + "startOverride")
                if so is not None:
                    over[wa(lo, "ilvl")] = int(wa(so, "val"))
            self.nums[wa(nm, "numId")] = (wa(nm.find(W + "abstractNumId"), "val"), over)

    def label(self, ppr):
        """Return None, or dict(kind='number'|'bullet', text=..., numId=..., font=...)."""
        if ppr is None:
            return None
        npr = ppr.find(W + "numPr")
        if npr is None:
            return None
        num_id = wa(npr.find(W + "numId"), "val")
        lvl = wa(npr.find(W + "ilvl"), "val", "0")
        if num_id in (None, "0") or num_id not in self.nums:
            return None
        abs_id, over = self.nums[num_id]
        level = self.abstract.get(abs_id, {}).get(lvl)
        if level is None:
            return None
        key = ("num", num_id) if lvl in over else ("abs", abs_id)
        cnt = self.counters.setdefault(key, {})
        start = over.get(lvl, level["start"])
        cnt[lvl] = cnt.get(lvl, start - 1) + 1
        if level["fmt"] == "bullet":
            return dict(kind="bullet", text=level["text"], codepoints=["U+%04X" % ord(c) for c in level["text"]],
                        font=level["font"], numId=num_id, n=cnt[lvl], ind=level["ind"])
        if level["fmt"] == "decimal":
            shown = str(cnt[lvl])
        else:
            shown = "%s?%d" % (level["fmt"], cnt[lvl])
        return dict(kind="number", text=level["text"].replace("%" + str(int(lvl) + 1), shown),
                    numId=num_id, n=cnt[lvl], ind=level["ind"])


def _run_fmt(r):
    rpr = r.find(W + "rPr")
    d = dict(ascii=None, hAnsi=None, cs=None, eastAsia=None, hint=None, sz=None, szCs=None,
             b=False, bCs=False, rtl=False, highlight=None, color=None, underline=None)
    if rpr is None:
        return d
    f = rpr.find(W + "rFonts")
    if f is not None:
        for k in ("ascii", "hAnsi", "cs", "eastAsia", "hint"):
            d[k] = wa(f, k)
    for tag, key in (("sz", "sz"), ("szCs", "szCs")):
        e = rpr.find(W + tag)
        if e is not None:
            d[key] = int(wa(e, "val"))
    for tag, key in (("b", "b"), ("bCs", "bCs"), ("rtl", "rtl")):
        e = rpr.find(W + tag)
        if e is not None and wa(e, "val", "1") not in ("0", "false"):
            d[key] = True
    for tag, key in (("highlight", "highlight"), ("color", "color"), ("u", "underline")):
        e = rpr.find(W + tag)
        if e is not None:
            d[key] = wa(e, "val")
    return d


def _effective(d, text):
    """Which font, size and weight apply to this run. For a right-to-left run
    Word uses the complex-script font, size and bold (cs, szCs, bCs)."""
    probe = text.strip()[:1]
    if d["rtl"]:
        font, half, bold = d["cs"], d["szCs"], d["bCs"]
    else:
        if probe and (probe == BOX or ord(probe) >= 0x2000):
            font = d["eastAsia"] if d["hint"] == "eastAsia" else (d["hAnsi"] or d["eastAsia"])
        elif probe and probe.isascii():
            font = d["ascii"]
        else:
            font = d["hAnsi"] or d["ascii"]
        half, bold = d["sz"], d["b"]
    return dict(
        font=font or "document default",
        pt=(half / 2.0) if half else 11.0,
        pt_is_default=half is None,
        bold=bool(bold),
        rtl=d["rtl"],
        highlight=d["highlight"],
        color=d["color"],
    )


def _style_dict(s):
    out = OrderedDict()
    for part in (s or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def _pt(v):
    m = re.match(r"^(-?[0-9.]+)pt$", v or "")
    return float(m.group(1)) if m else None


class _Ctx(object):
    def __init__(self, numbering, styles=None):
        self.numbering = numbering
        self.style_bidi = {}
        self.default_style = None
        based = {}
        own = {}
        if styles is not None:
            for st in styles.findall(W + "style"):
                if wa(st, "type") != "paragraph":
                    continue
                sid = wa(st, "styleId")
                if wa(st, "default") == "1":
                    self.default_style = sid
                b = st.find(W + "basedOn")
                based[sid] = wa(b, "val") if b is not None else None
                ppr = st.find(W + "pPr")
                e = ppr.find(W + "bidi") if ppr is not None else None
                own[sid] = None if e is None else (wa(e, "val", "1") not in ("0", "false"))
        for sid in own:
            cur, seen = sid, set()
            val = None
            while cur is not None and cur not in seen:
                seen.add(cur)
                if own.get(cur) is not None:
                    val = own[cur]
                    break
                cur = based.get(cur)
            self.style_bidi[sid] = bool(val)

    def is_rtl(self, ppr):
        e = ppr.find(W + "bidi") if ppr is not None else None
        if e is not None:
            return wa(e, "val", "1") not in ("0", "false")
        st = ppr.find(W + "pStyle") if ppr is not None else None
        sid = wa(st, "val") if st is not None else self.default_style
        return self.style_bidi.get(sid, False)


def _parse_par(p, ctx):
    ppr = p.find(W + "pPr")
    info = OrderedDict()
    info["jc"] = wa(ppr.find(W + "jc"), "val") if ppr is not None and ppr.find(W + "jc") is not None else None
    info["rtl"] = ctx.is_rtl(ppr)
    info["style"] = wa(ppr.find(W + "pStyle"), "val") if ppr is not None and ppr.find(W + "pStyle") is not None else None
    for tag in ("spacing", "ind"):
        e = ppr.find(W + tag) if ppr is not None else None
        info[tag] = dict((k.split("}")[1], v) for k, v in e.attrib.items()) if e is not None else {}
    e = ppr.find(W + "shd") if ppr is not None else None
    info["fill"] = wa(e, "fill") if e is not None else None
    e = ppr.find(W + "tabs") if ppr is not None else None
    info["tabs"] = [dict(val=wa(t, "val"), pos=wa(t, "pos")) for t in e] if e is not None else []
    info["label"] = ctx.numbering.label(ppr)

    lines = [[]]
    textboxes = []
    shapes = []
    flags = dict(lrpb=False, page_break=False)

    def add(text, fmt):
        eff = _effective(fmt, text)
        cur = lines[-1]
        if cur and all(cur[-1][k] == eff[k] for k in ("font", "pt", "bold", "rtl", "highlight", "color")):
            cur[-1]["text"] += text
        else:
            seg = dict(text=text)
            seg.update(eff)
            cur.append(seg)

    def handle_run(r):
        fmt = _run_fmt(r)
        for c in r:
            tag = c.tag
            if tag == W + "t":
                if c.text:
                    add(c.text, fmt)
            elif tag == W + "tab":
                add("\t", fmt)
            elif tag == W + "br":
                kind = wa(c, "type")
                if kind == "page":
                    flags["page_break"] = True
                else:
                    lines.append([])
            elif tag == W + "lastRenderedPageBreak":
                flags["lrpb"] = True
            elif tag == W + "sym":
                add("<SYM %s %s>" % (wa(c, "font"), wa(c, "char")), fmt)
            elif tag == W + "pict":
                _parse_pict(c, ctx, textboxes, shapes)

    for child in p:
        if child.tag == W + "r":
            handle_run(child)
        elif child.tag in (W + "hyperlink", W + "smartTag", W + "ins"):
            for r in child.findall(W + "r"):
                handle_run(r)

    par = OrderedDict()
    par.update(info)
    par["align_on_paper"] = align_on_paper(info, info["rtl"])
    par["lines"] = [dict(raw="".join(s["text"] for s in ln), runs=ln) for ln in lines]
    par["text"] = "\n".join(l["raw"] for l in par["lines"])
    par["empty"] = not par["text"].strip()
    par["textboxes"] = textboxes
    par["shapes"] = shapes
    par["lrpb"] = flags["lrpb"]
    par["page_break"] = flags["page_break"]
    return par


def _parse_pict(pict, ctx, textboxes, shapes):
    for sh in pict:
        if not sh.tag.startswith(V):
            continue
        kind = sh.tag[len(V):]
        if kind == "shapetype":
            continue
        style = _style_dict(sh.get("style"))
        geo = OrderedDict()
        for key, name in (("margin-left", "left"), ("margin-top", "top"), ("width", "width"), ("height", "height")):
            pt = _pt(style.get(key))
            if pt is not None:
                geo[name + "_pt"] = pt
                geo[name + "_mm"] = mm_pt(pt)
        geo["relative_h"] = style.get("mso-position-horizontal-relative", "text (default)")
        geo["relative_v"] = style.get("mso-position-vertical-relative", "paragraph (default)")
        item = OrderedDict(kind=kind, id=sh.get("id"), geometry=geo,
                           fillcolor=sh.get("fillcolor"), stroked=sh.get("stroked"),
                           strokecolor=sh.get("strokecolor"), strokeweight=sh.get("strokeweight"))
        sub = sh.find(V + "shadow")
        if sub is not None:
            item["shadow"] = dict(sub.attrib)
        sub = sh.find(V + "fill")
        if sub is not None:
            item["fill"] = dict(sub.attrib)
        tb = sh.find(V + "textbox")
        if tb is not None:
            content = tb.find(W + "txbxContent")
            item["paras"] = [_parse_par(q, ctx) for q in content.findall(W + "p")] if content is not None else []
            textboxes.append(item)
        else:
            shapes.append(item)


def _borders(e):
    if e is None:
        return {}
    out = OrderedDict()
    for b in e:
        out[b.tag[len(W):]] = dict(val=wa(b, "val"), sz=wa(b, "sz"), color=wa(b, "color"))
    return out


def _parse_tbl(t, ctx):
    tp = t.find(W + "tblPr")
    tbl = OrderedDict()
    tbl["style"] = wa(tp.find(W + "tblStyle"), "val") if tp.find(W + "tblStyle") is not None else None
    tbl["bidiVisual"] = tp.find(W + "bidiVisual") is not None
    tbl["layout"] = wa(tp.find(W + "tblLayout"), "type") if tp.find(W + "tblLayout") is not None else "auto"
    tbl["jc"] = wa(tp.find(W + "jc"), "val") if tp.find(W + "jc") is not None else None
    e = tp.find(W + "tblW")
    tbl["width_tw"] = int(wa(e, "w", "0")) if e is not None else None
    e = tp.find(W + "tblInd")
    tbl["ind_tw"] = int(wa(e, "w", "0")) if e is not None else 0
    e = tp.find(W + "tblpPr")
    tbl["floating"] = dict((k.split("}")[1], v) for k, v in e.attrib.items()) if e is not None else None
    tbl["borders"] = _borders(tp.find(W + "tblBorders"))
    e = tp.find(W + "tblCellMar")
    tbl["cell_margins_tw"] = dict((b.tag[len(W):], int(wa(b, "w", "0"))) for b in e) if e is not None else {}
    grid = [int(wa(g, "w")) for g in t.find(W + "tblGrid")]
    tbl["grid_tw"] = grid
    tbl["grid_mm"] = [mm_tw(g) for g in grid]
    tbl["grid_sum_tw"] = sum(grid)
    rows = []
    for tr in t.findall(W + "tr"):
        trp = tr.find(W + "trPr")
        row = OrderedDict()
        e = trp.find(W + "trHeight") if trp is not None else None
        row["min_height_tw"] = int(wa(e, "val")) if e is not None else None
        row["height_rule"] = wa(e, "hRule", "not stated") if e is not None else None
        row["cant_split"] = bool(trp is not None and trp.find(W + "cantSplit") is not None)
        cells = []
        col = 1
        for tc in tr.findall(W + "tc"):
            cp = tc.find(W + "tcPr")
            cell = OrderedDict()
            span = int(wa(cp.find(W + "gridSpan"), "val")) if cp is not None and cp.find(W + "gridSpan") is not None else 1
            cell["col_from"] = col
            cell["col_to"] = col + span - 1
            col += span
            e = cp.find(W + "tcW") if cp is not None else None
            cell["width_tw"] = int(wa(e, "w")) if e is not None else None
            e = cp.find(W + "vMerge") if cp is not None else None
            cell["vmerge"] = (wa(e, "val") or "continue") if e is not None else None
            e = cp.find(W + "shd") if cp is not None else None
            fill = wa(e, "fill") if e is not None else None
            cell["fill"] = None if fill in (None, "auto") else fill
            e = cp.find(W + "vAlign") if cp is not None else None
            cell["valign"] = wa(e, "val") if e is not None else "top"
            cell["borders"] = _borders(cp.find(W + "tcBorders")) if cp is not None else {}
            cell["paras"] = [_parse_par(q, ctx) for q in tc.findall(W + "p")]
            cells.append(cell)
        row["cells"] = cells
        rows.append(row)
    tbl["rows"] = rows
    return tbl


def _parse_anchor_part(root):
    """Header or footer: the one anchored picture."""
    out = []
    for an in root.iter(WP + "anchor"):
        d = OrderedDict()
        for sub in an:
            name = sub.tag[len(WP):] if sub.tag.startswith(WP) else None
            if name == "positionH":
                d["h_relative_from"] = sub.get("relativeFrom")
                d["h_offset_emu"] = int(sub.find(WP + "posOffset").text)
            elif name == "positionV":
                d["v_relative_from"] = sub.get("relativeFrom")
                d["v_offset_emu"] = int(sub.find(WP + "posOffset").text)
            elif name == "extent":
                d["cx_emu"] = int(sub.get("cx"))
                d["cy_emu"] = int(sub.get("cy"))
            elif name == "docPr":
                d["name"] = sub.get("name")
            elif name and name.startswith("wrap"):
                d["wrap"] = name
        blip = an.find(".//" + A + "blip")
        d["embed"] = blip.get(R + "embed") if blip is not None else None
        src = an.find(".//" + A + "srcRect")
        d["cropped"] = bool(src is not None and src.attrib)
        out.append(d)
    return out


def _image_size(data):
    """Pixel size of a PNG or JPEG without any library."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                return int.from_bytes(data[i + 7:i + 9], "big"), int.from_bytes(data[i + 5:i + 7], "big")
            i += 2 + int.from_bytes(data[i + 2:i + 4], "big")
    return None, None


def docx_path(code):
    return os.path.join(CLIENT_DOCS, FORMS[code]["file"])


def load_form(code):
    path = docx_path(code)
    with open(path, "rb") as fh:
        blob = fh.read()
    z = zipfile.ZipFile(path)
    names = set(z.namelist())

    def xml(name):
        return ET.fromstring(z.read(name)) if name in names else None

    doc = xml("word/document.xml")
    numbering = Numbering(xml("word/numbering.xml"))
    ctx = _Ctx(numbering, xml("word/styles.xml"))
    model = OrderedDict()
    model["form"] = code
    model["file"] = FORMS[code]["file"]
    model["name"] = FORMS[code]["name"]
    model["sha256"] = hashlib.sha256(blob).hexdigest()

    app = z.read("docProps/app.xml").decode("utf8") if "docProps/app.xml" in names else ""
    core = z.read("docProps/core.xml").decode("utf8") if "docProps/core.xml" in names else ""

    def grab(src, tag):
        m = re.search(r"<%s[^>]*>(.*?)</%s>" % (tag, tag), src)
        return m.group(1) if m else None

    model["word"] = OrderedDict(
        application=grab(app, "Application"), app_version=grab(app, "AppVersion"),
        pages_recorded=int(grab(app, "Pages") or 0), words_recorded=int(grab(app, "Words") or 0),
        created=grab(core, "dcterms:created"), modified=grab(core, "dcterms:modified"),
        last_printed=grab(core, "cp:lastPrinted"),
    )

    body = doc.find(W + "body")
    sect = body.find(W + "sectPr")
    pg, mar = sect.find(W + "pgSz"), sect.find(W + "pgMar")
    page = OrderedDict()
    page["width_tw"], page["height_tw"] = int(wa(pg, "w")), int(wa(pg, "h"))
    page["width_mm"], page["height_mm"] = mm_tw(page["width_tw"]), mm_tw(page["height_tw"])
    page["orientation"] = wa(pg, "orient", "portrait")
    page["margins_tw"] = OrderedDict((k, int(wa(mar, k))) for k in ("top", "right", "bottom", "left", "header", "footer", "gutter"))
    page["margins_mm"] = OrderedDict((k, mm_tw(v)) for k, v in page["margins_tw"].items())
    page["text_width_tw"] = page["width_tw"] - page["margins_tw"]["left"] - page["margins_tw"]["right"]
    page["text_width_mm"] = mm_tw(page["text_width_tw"])
    page["body_height_tw"] = page["height_tw"] - page["margins_tw"]["top"] - page["margins_tw"]["bottom"]
    page["body_height_mm"] = mm_tw(page["body_height_tw"])
    page["section_bidi"] = sect.find(W + "bidi") is not None
    model["page"] = page

    # letterhead and footer pictures
    for part in ("header", "footer"):
        name = "word/%s1.xml" % part
        root = xml(name)
        rels = xml("word/_rels/%s1.xml.rels" % part)
        targets = dict((r_.get("Id"), r_.get("Target")) for r_ in rels) if rels is not None else {}
        pics = _parse_anchor_part(root) if root is not None else []
        for d in pics:
            target = targets.get(d.get("embed"))
            d["media"] = target
            if target:
                data = z.read("word/" + target)
                d["media_sha256"] = hashlib.sha256(data).hexdigest()
                d["pixels"] = list(_image_size(data))
            d["width_mm"], d["height_mm"] = mm_emu(d["cx_emu"]), mm_emu(d["cy_emu"])
            d["h_offset_mm"], d["v_offset_mm"] = mm_emu(d["h_offset_emu"]), mm_emu(d["v_offset_emu"])
            if d.get("pixels") and d["pixels"][0]:
                natural = d["width_mm"] * d["pixels"][1] / float(d["pixels"][0])
                d["natural_height_mm_at_this_width"] = round(natural, 2)
                d["height_ratio_to_natural"] = round(d["height_mm"] / natural, 3)
        model[part] = pics

    blocks = []
    pi = ti = 0
    for child in body:
        if child.tag == W + "p":
            pi += 1
            par = _parse_par(child, ctx)
            blk = OrderedDict(type="p", id="P%d" % pi)
            blk.update(par)
            blocks.append(blk)
        elif child.tag == W + "tbl":
            ti += 1
            tbl = _parse_tbl(child, ctx)
            blk = OrderedDict(type="tbl", id="T%d" % ti)
            blk.update(tbl)
            for ri, row in enumerate(blk["rows"], 1):
                row["id"] = "T%d.r%d" % (ti, ri)
                for ci, cell in enumerate(row["cells"], 1):
                    cell["id"] = "T%d.r%d.c%d" % (ti, ri, ci)
            blocks.append(blk)
    model["blocks"] = blocks
    z.close()
    return model


def media_bytes(code, target):
    with zipfile.ZipFile(docx_path(code)) as z:
        return z.read("word/" + target)


# --------------------------------------------------------------------------
# Helpers over the model
# --------------------------------------------------------------------------


def cell_lines(cell):
    """All lines of a cell in order: (paragraph index, line dict, paragraph)."""
    out = []
    for pi, par in enumerate(cell["paras"]):
        for ln in par["lines"]:
            out.append((pi, ln, par))
    return out


def cell_text(cell):
    return "\n".join(par["text"] for par in cell["paras"])


def align_on_paper(par, in_rtl=True):
    """Which side the text sits on paper. In a right-to-left paragraph Word
    treats jc=left as the start side (right) and jc=right as the end side
    (left). This is Word's rule applied to the XML value; it was not seen
    rendered."""
    jc = par.get("jc")
    if jc in (None, "start"):
        return "right" if in_rtl else "left"
    if jc == "center":
        return "centre"
    if jc == "left":
        return "right" if in_rtl else "left"
    if jc in ("right", "end"):
        return "left" if in_rtl else "right"
    if jc in ("both", "lowKashida", "mediumKashida", "highKashida", "distribute"):
        return "justified"
    return jc


def iter_locations(model):
    """Every place that can hold text, in document order:
    (loc id, kind, object). kind is 'box' | 'par' | 'cell'."""
    for blk in model["blocks"]:
        if blk["type"] == "p":
            for bi, box in enumerate(blk["textboxes"], 1):
                yield ("%s.box%s" % (blk["id"], "" if len(blk["textboxes"]) == 1 else bi), "box", box)
            yield (blk["id"], "par", blk)
        else:
            for row in blk["rows"]:
                for cell in row["cells"]:
                    yield (cell["id"], "cell", cell)


def location_words(kind, obj):
    if kind == "box":
        out = []
        for par in obj["paras"]:
            for ln in par["lines"]:
                out.extend(words(ln["raw"]))
        return out
    if kind == "par":
        out = []
        for ln in obj["lines"]:
            out.extend(words(ln["raw"]))
        return out
    out = []
    for par in obj["paras"]:
        for ln in par["lines"]:
            out.extend(words(ln["raw"]))
    return out


if __name__ == "__main__":
    # quick self-check: python3 -I formxml.py [CODE]
    codes = sys.argv[1:] or list(FORMS)
    for code in codes:
        m = load_form(code)
        npar = sum(1 for b in m["blocks"] if b["type"] == "p")
        ntbl = sum(1 for b in m["blocks"] if b["type"] == "tbl")
        ncell = sum(len(r["cells"]) for b in m["blocks"] if b["type"] == "tbl" for r in b["rows"])
        nword = sum(len(location_words(k, o)) for _, k, o in iter_locations(m))
        print("%-2s %-28s paragraphs=%d tables=%d cells=%d words=%d pages_recorded=%d sha256=%s" % (
            code, m["file"], npar, ntbl, ncell, nword, m["word"]["pages_recorded"], m["sha256"][:12]))
