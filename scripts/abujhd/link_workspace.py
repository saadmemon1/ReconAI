# scripts/abujhd/link_workspace.py
"""Point a data folder at a DocAI workspace: find the workspace by name (create it if missing) and write its id
into <data>/config.json as kb_id, so the app's Report tab can open that folder's report.json.
Reads DOCAI_API_KEY from the environment or .env.local; prints only the workspace name and id."""
import argparse, json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import requests
import common


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", required=True); ap.add_argument("--name", required=True); a = ap.parse_args()
    key = common.env("DOCAI_API_KEY")
    if not key: sys.exit("DOCAI_API_KEY is not set (environment or .env.local)")
    h = {"x-api-key": key}
    r = requests.get(f"{common.DOCAI}/v1/knowledge-bases", headers=h, timeout=60); r.raise_for_status()
    kb = next((k for k in r.json().get("knowledge_bases", []) if k.get("name") == a.name), None)
    if kb is None:
        r = requests.post(f"{common.DOCAI}/v1/knowledge-bases", headers=h, json={"name": a.name}, timeout=60); r.raise_for_status()
        body = r.json(); kb = body.get("knowledge_base") or body
        print("created workspace", a.name)
    cfg_path = pathlib.Path(a.data) / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["kb_id"] = kb["id"]
    cfg_path.write_text(json.dumps(cfg, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{a.name}: kb_id {kb['id']} written to {cfg_path}")


if __name__ == "__main__":
    main()
