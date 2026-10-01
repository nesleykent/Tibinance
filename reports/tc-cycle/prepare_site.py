"""Package only the report's public assets, retaining its published route."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "dist"
REPORT = OUTPUT / "reports" / "tc-cycle"
PUBLIC_FILES = ("index.html", "pt-br.html", "report.css", "report.js", "results.json", "complement.json", "market-update.json", "inflation.json", "inflation-monthly.csv", "inflation-annual.csv", "lifecycle.json", "mergers.json", "robustness.json", "forecast-ledger.jsonl")


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    for filename in PUBLIC_FILES:
        shutil.copyfile(ROOT / filename, REPORT / filename)
    # The source report and the Sites publication share the same route and assets.
    (OUTPUT / "index.html").write_text('''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=reports/tc-cycle/"><title>Tibinance Research</title></head>
<body><a href="reports/tc-cycle/">Open the Tibia Coins report</a> · <a href="reports/tc-cycle/pt-br.html" hreflang="pt-BR" lang="pt-BR">Abrir o relatório em português</a></body></html>
''')
    manifest = json.loads((ROOT / ".openai/hosting.json").read_text())
    assert manifest["static"]["directory"] == "dist"
    print("Prepared the report at dist/reports/tc-cycle/")


if __name__ == "__main__":
    main()
