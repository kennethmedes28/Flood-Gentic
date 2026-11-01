"""Run the whole app for local work: the FastAPI backend and the Next.js frontend, side by side.

    python scripts/run_dev.py                  # backend on :8000, frontend on :3000
    python scripts/run_dev.py --memory         # keep conversations in memory (no database needed for the chat)
    python scripts/run_dev.py --no-reload      # do not restart the backend when its files change
    python scripts/run_dev.py --backend-port 8001 --frontend-port 3001

Works on Linux, macOS and Windows (on Windows start it with hooks\\run_all.bat). The Windows part has not been run on a
Windows computer yet.

What it does:
    1. Checks the tools and files that are needed (uv, npm, frontend/node_modules, backend/.env).
    2. Starts ``uvicorn main:app`` in backend/ and ``npm run dev`` in frontend/, and tells the frontend where
       the backend is (NEXT_PUBLIC_API_URL) and the backend which page may call it (CORS_ORIGINS).
    3. Prints both programs' output, each line marked [backend] or [frontend].
    4. When the backend answers, prints /health, so you can see at once whether the database and the chat model work.
    5. Press Ctrl+C once to stop both. If one of them stops by itself, the other one is stopped too.

The chat calls a paid model (MUSE_API in backend/.env) and photo checks call the vision service, so every
message you send from the page uses real API credit.
"""

import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

IS_WINDOWS = os.name == "nt"

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

STARTUP_WAIT_SECONDS = 90  # the first start can be slow (models load, Next compiles)
STOP_WAIT_SECONDS = 8  # how long a program gets to stop politely before it is killed


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Flood-Gentic backend and frontend together.")
    parser.add_argument("--backend-port", type=int, default=8000)
    parser.add_argument("--frontend-port", type=int, default=3000)
    parser.add_argument("--no-reload", action="store_true", help="do not restart the backend when its files change")
    parser.add_argument("--memory", action="store_true", help="CHECKPOINTER=memory: chats are kept in memory, not in Postgres")
    return parser.parse_args()


def port_is_free(port: int) -> bool:
    """True when nothing is listening on the port on this computer."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        return probe.connect_ex(("127.0.0.1", port)) != 0


def env_file_has(path: Path, name: str) -> bool:
    """True when ``NAME=something`` is set in an env file. The value itself is never read out or printed."""
    if not path.exists():
        return False
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() == name and value.strip().strip("\"'"):
            return True
    return False


def check_setup(arguments: argparse.Namespace) -> list[str]:
    """Return what stops the app from starting. Things that only reduce what works are printed as warnings."""
    problems = []
    for tool in ("uv", "npm"):
        if shutil.which(tool) is None:
            problems.append(f"'{tool}' is not installed or not on your PATH.")
    if not (FRONTEND_DIR / "node_modules").is_dir():
        problems.append("The frontend packages are not installed. Run:  cd frontend && npm install")
    for name, port in (("backend", arguments.backend_port), ("frontend", arguments.frontend_port)):
        if not port_is_free(port):
            problems.append(f"Port {port} ({name}) is already in use. Stop that program or pick another with --{name}-port.")

    env_file = BACKEND_DIR / ".env"
    if not env_file.exists():
        print("[run_dev] Warning: backend/.env is missing. Copy backend/.env.example and fill it in.")
    elif not env_file_has(env_file, "MUSE_API"):
        print("[run_dev] Warning: MUSE_API is not set in backend/.env, so weather and document answers will fail.")
    return problems


def stream_output(process: subprocess.Popen, label: str) -> None:
    """Print each line the program writes, marked with its name. Runs in a thread, ends when the program closes its output."""
    for line in process.stdout:
        print(f"[{label}] {line.rstrip()}", flush=True)


def start(label: str, command: list[str], folder: Path, extra_env: dict[str, str]) -> subprocess.Popen:
    """Start a program in its own process group, so Ctrl+C can stop it and everything it started."""
    # Windows only finds .exe files by name; npm is npm.cmd there, so use the full path that shutil.which finds.
    command = [shutil.which(command[0]) or command[0], *command[1:]]
    if IS_WINDOWS:
        group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    else:
        group = {"start_new_session": True}

    process = subprocess.Popen(
        command,
        cwd=folder,
        env={**os.environ, **extra_env},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        **group,
    )
    threading.Thread(target=stream_output, args=(process, label), daemon=True).start()
    return process


def stop(process: subprocess.Popen) -> None:
    """Stop a program and everything it started. Politely first where possible, by force if it does not stop."""
    if process.poll() is not None:
        return

    if IS_WINDOWS:
        # /T also ends the programs it started (npm starts node, uv starts python); /F forces it.
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
        return

    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=STOP_WAIT_SECONDS)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass  # it was already gone


def fetch_json(url: str) -> dict | None:
    """GET a URL and read the JSON, or None if it does not answer (yet)."""
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            return json.loads(response.read())
    except Exception:
        return None


def wait_until_ready(url: str, processes: list[subprocess.Popen]) -> dict | None:
    """Wait for the URL to answer. Gives up (None) after STARTUP_WAIT_SECONDS or when a program has stopped."""
    deadline = time.monotonic() + STARTUP_WAIT_SECONDS
    while time.monotonic() < deadline:
        if any(process.poll() is not None for process in processes):
            return None
        answer = fetch_json(url)
        if answer is not None:
            return answer
        time.sleep(1)
    return None


def print_health(health: dict) -> None:
    """Show what /health says, so a missing database or model key is clear before the first message."""
    print(f"[run_dev] Backend health: {health.get('status')}")
    for name, state in health.get("checks", {}).items():
        print(f"[run_dev]   {name}: {state}")


def stop_on_terminate(signal_number, frame) -> None:
    """Treat `kill` (SIGTERM) like Ctrl+C, so both programs are stopped instead of being left running."""
    raise KeyboardInterrupt


def main() -> int:
    signal.signal(signal.SIGTERM, stop_on_terminate)
    arguments = parse_arguments()
    problems = check_setup(arguments)
    if problems:
        for problem in problems:
            print(f"[run_dev] {problem}")
        return 1

    backend_url = f"http://localhost:{arguments.backend_port}"
    frontend_url = f"http://localhost:{arguments.frontend_port}"

    backend_command = ["uv", "run", "uvicorn", "main:app", "--port", str(arguments.backend_port)]
    if not arguments.no_reload:
        backend_command.append("--reload")
    backend_env = {"CORS_ORIGINS": f"{frontend_url},http://127.0.0.1:{arguments.frontend_port}"}
    if arguments.memory:
        backend_env["CHECKPOINTER"] = "memory"

    frontend_env = {"NEXT_PUBLIC_API_URL": backend_url, "PORT": str(arguments.frontend_port)}

    print(f"[run_dev] Starting the backend on {backend_url} and the frontend on {frontend_url} ...")
    processes = [
        start("backend", backend_command, BACKEND_DIR, backend_env),
        start("frontend", ["npm", "run", "dev"], FRONTEND_DIR, frontend_env),
    ]

    try:
        health = wait_until_ready(f"{backend_url}/health", processes)
        if health is None:
            if any(process.poll() is not None for process in processes):
                print("[run_dev] A program stopped while starting. See its output above.")
            else:
                print(f"[run_dev] The backend did not answer within {STARTUP_WAIT_SECONDS} s. See its output above.")
            return 1
        print_health(health)
        print(f"[run_dev] Ready. Open {frontend_url}  (Ctrl+C stops both)")

        # Stay here until one program stops or the user presses Ctrl+C.
        while all(process.poll() is None for process in processes):
            time.sleep(1)
        print("[run_dev] A program stopped, so the other one is being stopped too.")
        return 1
    except KeyboardInterrupt:
        print("\n[run_dev] Stopping ...")
        return 0
    finally:
        for process in processes:
            stop(process)


if __name__ == "__main__":
    sys.exit(main())
