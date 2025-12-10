import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
PROJECTS_DIR = BASE_DIR / "projects"


def load_project_file(project: str):
    project_file = PROJECTS_DIR / f"{project.lower()}.json"

    if not project_file.exists():
        print(f"\n❌ Project file not found: {project_file.name}")
        return None

    with open(project_file, "r") as f:
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
        for k in missing_in_env2:
            print(f"- {k}")

    if missing_in_env1:
        print(f"\nMissing in {env1}:")
        for k in missing_in_env1:
            print(f"- {k}")

    for service in common:
        if data[env1][service] != data[env2][service]:
            print(f"\nDifferent values in '{service}'")


def create_project_template(name: str):
    file = PROJECTS_DIR / f"{name.lower()}.json"

    if file.exists():
        print("\n❌ Project already exists")
        return

    template = {
        "project": {
            "description": f"{name} project",
            "commands": {},
            "notes": []
        },
        "dev": {
            "db": {},
            "elastic": {},
            "urls": {}
        },
        "prod": {
            "db": {},
            "elastic": {},
            "urls": {}
        }
    }

    PROJECTS_DIR.mkdir(exist_ok=True)

    with open(file, "w") as f:
        json.dump(template, f, indent=2)

    print(f"\n✅ Project '{name}' created successfully at: {file}")
