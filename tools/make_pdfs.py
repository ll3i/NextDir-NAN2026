# -*- coding: utf-8 -*-
"""Convert markdown docs to PDF using reportlab + Malgun Gothic."""
from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
)

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / "submit" / "pdf"
FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\malgun.ttf"),
    Path(r"C:\Windows\Fonts\malgunsl.ttf"),
    Path(r"C:\Windows\Fonts\NanumGothic.ttf"),
]


def register_font() -> str:
    for path in FONT_CANDIDATES:
        if path.exists():
            pdfmetrics.registerFont(TTFont("KR", str(path)))
            return "KR"
    raise FileNotFoundError("Korean TTF font not found")


def md_to_flowables(text: str, font: str):
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName=font, fontSize=16, leading=22, spaceAfter=10)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName=font, fontSize=13, leading=18, spaceBefore=12, spaceAfter=6)
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontName=font, fontSize=11, leading=15, spaceBefore=8, spaceAfter=4)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName=font, fontSize=10, leading=15, spaceAfter=4)
    code = ParagraphStyle("Code", parent=styles["Code"], fontName=font, fontSize=8.5, leading=12, backColor="#f4f4f4", spaceAfter=8)
    bullet = ParagraphStyle("Bullet", parent=body, leftIndent=12)

    flow = []
    lines = text.replace("\r\n", "\n").split("\n")
    i = 0
    in_code = False
    code_buf = []
    table_buf = []

    def flush_table():
        nonlocal table_buf
        if not table_buf:
            return
        for row in table_buf:
            if re.match(r"^\s*\|?\s*-+", row):
                continue
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            flow.append(Paragraph(" · ".join(cells), body))
        table_buf = []

    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("```"):
            if in_code:
                flow.append(Preformatted("\n".join(code_buf), code))
                code_buf = []
                in_code = False
            else:
                flush_table()
                in_code = True
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue
        if line.strip().startswith("|"):
            table_buf.append(line)
            i += 1
            continue
        else:
            flush_table()

        if not line.strip():
            flow.append(Spacer(1, 4))
        elif line.startswith("# "):
            flow.append(Paragraph(esc(line[2:].strip()), h1))
        elif line.startswith("## "):
            flow.append(Paragraph(esc(line[3:].strip()), h2))
        elif line.startswith("### "):
            flow.append(Paragraph(esc(line[4:].strip()), h3))
        elif line.startswith("> "):
            flow.append(Paragraph(esc(line[2:].strip()), body))
        elif line.startswith("- ") or line.startswith("* "):
            flow.append(Paragraph("• " + inline(line[2:].strip()), bullet))
        elif re.match(r"^\d+\.\s+", line):
            flow.append(Paragraph(inline(line.strip()), bullet))
        else:
            flow.append(Paragraph(inline(line.strip()), body))
        i += 1

    flush_table()
    if in_code and code_buf:
        flow.append(Preformatted("\n".join(code_buf), code))
    return flow


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def inline(s: str) -> str:
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`(.+?)`", r"<font face='Courier'>\1</font>", s)
    s = re.sub(r"\*(.+?)\*", r"<i>\1</i>", s)
    return s


def convert(md_path: Path, pdf_path: Path, font: str):
    text = md_path.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=md_path.stem,
        author="NextDir",
    )
    doc.build(md_to_flowables(text, font))
    print(f"PDF: {pdf_path}")


def main():
    font = register_font()
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("01_게임소개서.md", "01_게임소개서.pdf"),
        ("02_AI활용기술문서.md", "02_AI활용기술문서.pdf"),
        ("03_팀원역할기술서.md", "03_팀원역할기술서.pdf"),
        ("04_시연영상_스크립트.md", "04_시연영상_스크립트.pdf"),
    ]
    for src, dst in targets:
        convert(DOCS / src, OUT / dst, font)


if __name__ == "__main__":
    main()
