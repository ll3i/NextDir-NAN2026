# -*- coding: utf-8 -*-
from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "submit" / "NextDir_NAN2026_PreAssignment.zip"

INCLUDE = [
    ROOT / "README.md",
    ROOT / "SUBMIT_CHECKLIST.md",
    ROOT / "PLAN_UPGRADE.md",
    ROOT / "BENCHMARK_PLAN.md",
    ROOT / "STEAM_POPULAR_BENCHMARK.md",
    ROOT / "docs" / "design" / "core_loop.md",
    ROOT / "game" / "index.html",
    ROOT / "game" / "style.css",
    ROOT / "game" / "game.js",
    ROOT / "game" / "플레이하기.bat",
    ROOT / "docs" / "01_게임소개서.md",
    ROOT / "docs" / "02_AI활용기술문서.md",
    ROOT / "docs" / "03_팀원역할기술서.md",
    ROOT / "docs" / "04_시연영상_스크립트.md",
    ROOT / "submit" / "pdf" / "01_게임소개서.pdf",
    ROOT / "submit" / "pdf" / "02_AI활용기술문서.pdf",
    ROOT / "submit" / "pdf" / "03_팀원역할기술서.pdf",
    ROOT / "submit" / "pdf" / "04_시연영상_스크립트.pdf",
    ROOT / "demo" / "NextDir_DirectorLoop_Demo.webm",
]


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in INCLUDE:
            if not path.exists():
                print("MISSING:", path)
                continue
            arc = path.relative_to(ROOT).as_posix()
            zf.write(path, arcname=f"NextDir_NAN2026/{arc}")
            print("ADD", arc)
    print("ZIP:", OUT)


if __name__ == "__main__":
    main()
