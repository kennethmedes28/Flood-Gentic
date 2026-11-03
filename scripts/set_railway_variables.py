"""Copy the backend's secrets from backend/.env to the Railway service, and set the production switches.

Run it yourself, from the repository root, after `railway login` and `railway link` (see docs/deployment_workflow_guide.md):

    python3 scripts/set_railway_variables.py --dry-run     # show which variables would be set (names only)
    python3 scripts/set_railway_variables.py               # set them, without starting a deploy

Only what the running API needs is copied. The values are never printed. Not copied on purpose: SUPABASE_SECRET_KEY and
SUPABASE_ACCESS_TOKEN (full-power keys the API does not use), HF_TOKEN, GROQ_API_KEY, LLAMAINDEX_API_KEY, and the LangSmith
settings (tracing stays off in production so signed-in users' messages are not sent to a third party).
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / "backend" / ".env"
SERVICE = "Flood-Gentic"

# Copied from backend/.env.
SECRETS = ["MUSE_API", "SUPABASE_PROJECT_REF", "SUPABASE_PASSWORD", "SUPABASE_POOLER_HOST", "TOMMORROW_IO_API"]
# Set to fixed values. CORS_ORIGINS is added with --cors-origins once the frontend has an address.
SWITCHES = {"REQUIRE_AUTH": "true", "TRUST_PROXY_HEADERS": "true"}


def read_env(path: Path) -> dict[str, str]:
    """The KEY=value lines of an env file, without surrounding quotes."""
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if match:
            values[match.group(1)] = match.group(2).strip().strip('"').strip("'")
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="show the variable names that would be set, and set nothing")
    parser.add_argument("--cors-origins", help="the frontend address(es), comma separated, for example https://flood-gentic.vercel.app")
    args = parser.parse_args()

    env = read_env(ENV_FILE)
    missing = [name for name in SECRETS if not env.get(name)]
    if missing:
        print(f"Missing in {ENV_FILE.name}: {', '.join(missing)}")
        return 1

    variables = {name: env[name] for name in SECRETS} | SWITCHES
    if args.cors_origins:
        variables["CORS_ORIGINS"] = args.cors_origins

    print("Variables for the Railway service:", ", ".join(variables))
    if args.dry_run:
        return 0

    # --skip-deploys: only store them. The values go to the CLI as arguments and are not printed.
    command = ["railway", "variable", "set", *[f"{name}={value}" for name, value in variables.items()], "--service", SERVICE, "--skip-deploys"]
    result = subprocess.run(command, capture_output=True, text=True)
    print("Done." if result.returncode == 0 else f"railway failed with exit code {result.returncode}.")
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
