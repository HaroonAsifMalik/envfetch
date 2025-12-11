# EnvFetch 🔹 Manage Environment Variables, URLs, Commands, and Tasks

EnvFetch is a **lightweight Python CLI tool** that helps developers and teams manage environment variables, project URLs, commands, notes, and pending improvement tasks across multiple projects and environments.

---

## Features

- Fetch environment variables for specific **project, environment, and service**
- Store and retrieve important **URLs** (dashboards, admin panels, websites)
- Track **project-level commands** (build, run, test, migrate)
- Maintain **project notes** for reminders and guidance
- Track **pending tasks** with future improvement areas
- List all services in an environment
- Compare two environments (`diff`) to spot differences
- Auto-generate a **new project template** for quick setup

---

## Installation

Clone the repo:

```bash
git clone https://github.com/yourusername/envfetch.git
cd envfetch
````

No external dependencies required (Python 3.8+).

---

## Usage

### Create a new project

```bash
python envfetch.py --create-project <project_name>
```

### Get environment variables

```bash
python envfetch.py -p <project> -e <environment> -s <service>
```

Example:

```bash
python envfetch.py -p task-master -e dev -s db
```

### List all services

```bash
python envfetch.py -p task-master -e dev --list
```

### Compare environments

```bash
python envfetch.py -p task-master --diff dev prod
```

### Show project commands

```bash
python envfetch.py -p task-master --commands
```

### Show project notes

```bash
python envfetch.py -p task-master --notes
```

### Show pending tasks

```bash
# All tasks
python envfetch.py -p task-master --pending

# Specific task
python envfetch.py -p task-master --pending --task "Upgrade DB"
```

---

## Project File Structure

Each project is stored as a **JSON file** under `projects/`:

```
projects/
 └── task-master.json
```

Example structure:

```json
{
  "project": {
    "description": "TaskMaster Project Services",

    "commands": {
      "run_backend": "python manage.py runserver",
      "run_frontend": "npm run start"
    }
  },
  "local": {
    "db": {
      "DATABASE_URL": "postgres://user:password@localhost:5432/taskmaster_db"
    }
  },
  "prod": {
    "db": {
      "DATABASE_URL": "postgres://prod_user:prod_pass@prod-host:5432/prod_taskmaster_db"
    }
  },
  "dev": {
    "db": {
      "DATABASE_URL": "postgres://dev_user:dev_pass@dev-host:5432/dev_taskmaster_db"
    }
  }
}

```

---

## Why EnvFetch?

* Keep all **project info in one place**
* Avoid repetitive environment setups
* Easily scale for **multiple projects & environments**
* Great for **team collaboration & onboarding**

---

## Contributing

Suggestions, improvements, and feedback are welcome!

* Add new features
* Improve CLI usability
* Suggest integrations (AWS SSM, Vault, auto-open URLs, etc.)

