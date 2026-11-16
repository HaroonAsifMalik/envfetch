"""Local JSON storage for EnvFetch.

One JSON file per project lives in the data directory (``projects/`` by default,
or wherever ``ENVFETCH_DATA_DIR`` / ``--data-dir`` points). Both the CLI and the
web UI go through this module, so there is exactly one place that touches disk.
"""
import json
import os
import re
import shutil
import tempfile
import time
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
PROJECTS_DIR = Path(os.environ.get("ENVFETCH_DATA_DIR") or (BASE_DIR / "projects")).expanduser()

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
BACKUP_EVERY_SECONDS = 300
BACKUPS_KEEP = 10


# --------------------------------------------------------------------------- #
# Paths & names
# --------------------------------------------------------------------------- #
def set_data_dir(path):
    """Point EnvFetch at a different data directory (e.g. a private repo)."""
    global PROJECTS_DIR
    PROJECTS_DIR = Path(path).expanduser().resolve()


def is_valid_name(name):
    return bool(NAME_RE.match(name or ""))


def project_file(name):
    return PROJECTS_DIR / f"{name.lower()}.json"


def list_projects():
    if not PROJECTS_DIR.is_dir():
        return []
    return sorted(p.stem for p in PROJECTS_DIR.glob("*.json") if is_valid_name(p.stem))


def file_rev(name):
    """A cheap version token: changes whenever the file is rewritten."""
    return str(project_file(name).stat().st_mtime_ns)


# --------------------------------------------------------------------------- #
# Read / write
# --------------------------------------------------------------------------- #
def read_project(name):
    """Return the parsed project dict. Raises FileNotFoundError / ValueError."""
    with open(project_file(name), "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("a project file must contain a JSON object")
    return data


def _backup(path):
    backup_dir = PROJECTS_DIR / ".backups"
    backup_dir.mkdir(exist_ok=True)
    existing = sorted(backup_dir.glob(f"{path.stem}.*.json"))
    if existing and time.time() - existing[-1].stat().st_mtime < BACKUP_EVERY_SECONDS:
        return
    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, backup_dir / f"{path.stem}.{stamp}.json")
    for old in sorted(backup_dir.glob(f"{path.stem}.*.json"))[:-BACKUPS_KEEP]:
        old.unlink()


def write_project(name, data):
    """Atomically write a project file (and keep a rolling backup)."""
    path = project_file(name)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    if path.exists():
        _backup(path)

    fd, tmp = tempfile.mkstemp(dir=PROJECTS_DIR, prefix=f".{path.stem}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def build_template(name, description=""):
    return {
        "project": {
            "description": description or f"{name} project",
            "commands": {},
            "notes": [],
            "links": [],
            "tasks": [],
        },
        "local": {"urls": {}},
        "dev": {"db": {}, "urls": {}},
        "prod": {"db": {}, "urls": {}},
    }


# --------------------------------------------------------------------------- #
# CLI helpers (these print, the web server uses the functions above)
# --------------------------------------------------------------------------- #
def load_project_file(project: str):
    project_file_path = project_file(project)

    if not project_file_path.exists():
        print(f"\n❌ Project file not found: {project_file_path.name}")
        return None

    with open(project_file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_project_data(project: str):
    return load_project_file(project)


def load_environment_data(project: str, env: str, service: str):
    data = load_project_file(project)
    if not data:
        return None

    env = env.lower()
    service = service.lower()

    try:
        return data[env][service]
    except KeyError:
        print(f"\n❌ No service '{service}' in '{env}' environment")
        return None


def list_services(project: str, env: str):
    data = load_project_file(project)
    if not data:
        return

    env = env.lower()

    if env not in data:
        print(f"\n❌ Environment '{env}' not found")
        return

    print(f"\nServices in {project} [{env}]:")
    for key in data[env].keys():
        print(f"- {key}")


def diff_envs(project: str, env1: str, env2: str):
    data = load_project_file(project)
    if not data:
        return

    env1 = env1.lower()
    env2 = env2.lower()

    if env1 not in data or env2 not in data:
        print("\n❌ One of the environments does not exist")
        return

    env1_keys = set(data[env1].keys())
    env2_keys = set(data[env2].keys())

    print(f"\n🔍 DIFF for project: {project}")

    missing_in_env2 = env1_keys - env2_keys
    missing_in_env1 = env2_keys - env1_keys
    common = env1_keys & env2_keys

    if missing_in_env2:
        print(f"\nMissing in {env2}:")
        for k in sorted(missing_in_env2):
            print(f"- {k}")

    if missing_in_env1:
        print(f"\nMissing in {env1}:")
        for k in sorted(missing_in_env1):
            print(f"- {k}")

    for service in sorted(common):
        if data[env1][service] != data[env2][service]:
            print(f"\nDifferent values in '{service}'")


def create_project_template(name: str):
    name = name.lower()
    if not is_valid_name(name):
        print("\n❌ Use letters, numbers, '-' or '_' for the project name (max 64 chars)")
        return

    file = project_file(name)

    if file.exists():
        print("\n❌ Project already exists")
        return

    write_project(name, build_template(name))
    print(f"\n✅ Project '{name}' created successfully at: {file}")
