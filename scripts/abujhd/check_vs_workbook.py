# scripts/abujhd/check_vs_workbook.py
"""Regression gate: compare matches.json with a human reconciliation workbook (sheet 'Card statement Sep', columns
Date dd/mm, Time hh:mm, SAR, Matched Yes/blank). Exits 1 when agreement drops below --min-agree or wrong verdicts (we say missing where the workbook found a receipt,
or we match where it found none) exceed --max-wrong. Undecided (REVIEW) rows are neither.
    python3 scripts/abujhd/check_vs_workbook.py --data data/abujhd --workbook <path.xlsx> [--min-agree 85 --max-wrong 5]"""
import argparse, collections, json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import common

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data/abujhd"); ap.add_argument("--workbook", required=True)
    ap.add_argument("--min-agree", type=int, default=0); ap.add_argument("--max-wrong", type=int, default=10**6); a = ap.parse_args()
    common.set_data(a.data)
    import openpyxl
    ws = openpyxl.load_workbook(a.workbook, data_only=True)["Card statement Sep"]
    xs = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[0] and r[4] is not None]
    ours = collections.defaultdict(list)
    for r in common.load_json(common.DATA / "matches.json")["rows"]:
        ours[(r["date"], r["time"][:5], round(r["amount"], 2))].append(r)
    cnt, diffs, used = collections.Counter(), [], set()
    for r in xs:
        d, t = str(r[0]), str(r[1]); k = (f"2026-{d[3:5]}-{d[0:2]}", t[:5], round(abs(float(r[4])), 2))
        o = next((x for x in ours.get(k, []) if x["ref"] not in used), None)
        if not o or o["kind"] != "purchase": continue
        used.add(o["ref"]); xm = (r[6] or "").strip().lower() == "yes"
        same = (xm and o["status"] in ("MATCHED", "AMOUNT_MISMATCH")) or (not xm and o["status"] == "MISSING_RECEIPT")
        cnt["agree" if same else "review" if o["status"] == "REVIEW" else "ours_missing" if xm else "ours_matched"] += 1
        if not same: diffs.append(f"  {k[0]} {k[1]} {k[2]:>8.2f} {str(r[3])[:28]:28} workbook={'Yes' if xm else '-':3} ours={o['status']}")
    print("purchase rows:", dict(cnt)); print("\n".join(diffs))
    wrong = cnt["ours_missing"] + cnt["ours_matched"]
    bad = cnt["agree"] < a.min_agree or wrong > a.max_wrong
    print("GATE", "FAIL" if bad else "OK", f"(agree {cnt['agree']} >= {a.min_agree}, wrong {wrong} <= {a.max_wrong}, review {cnt['review']})")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
