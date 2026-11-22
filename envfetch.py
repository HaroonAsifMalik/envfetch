import argparse
import os
import ssl
import subprocess
import sys
import urllib.request

try:
    import certifi as _certifi
    _SSL_CAFILE = _certifi.where()
except ImportError:
    _SSL_CAFILE = None

from sources import local
from sources import tasks as task_lib
from sources.local import (
    load_environment_data,
    load_project_data,
    list_services,
    diff_envs,
    create_project_template,
)


def print_dict(data):
    for k, v in data.items():
        print(f"{k}: {v}")


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
def format_task(task, with_project=None):
    mark = task_lib.STATUS_MARK.get(task.get("status"), "○")
    done, total = task_lib.step_progress(task)
    bits = [f"{mark} {task['id']}  {task['title']}"]
    if with_project:
        bits.append(f"[{with_project}]")
    if task.get("priority") in ("high", "urgent"):
        bits.append(f"!{task['priority']}")
    if task.get("due"):
        bits.append(f"due {task['due']}")
    if total:
        bits.append(f"({done}/{total} steps)")
    return "  ".join(bits)


def show_tasks(project, status=None):
    doc = load_project_data(project)
    if doc is None:
        return
    tasks = list(task_lib.get_tasks(doc))
    legacy = task_lib.legacy_items(doc)

    if status:
        tasks = [t for t in tasks if t.get("status") == status]
    else:
        tasks = [t for t in tasks if t.get("status") != "done"]

    if not tasks and not legacy:
        print("\n✅ No open tasks")
        return

    print(f"\n📌 {'Tasks' if status else 'Open tasks'} for {project}:\n")
    order = {s: i for i, s in enumerate(task_lib.STATUSES)}
    tasks.sort(key=lambda t: (order.get(t.get("status"), 0), task_lib.PRIORITY_RANK.get(t.get("priority"), 2)))
    for task in tasks:
        print("  " + format_task(task))

    if legacy and not status:
        print("\n  Older 'pending_tasks' (open the web UI to import them as real tasks):")
        for group, text in legacy:
            print(f"  • [{group}] {text}")


def show_legacy_pending(project, wanted_task=None):
    """The original `--pending_tasks` output, kept for backwards compatibility."""
    data = load_project_data(project)
    if data is None:
        return
    pending = (data.get("project") or {}).get("pending_tasks") or {}

    if not pending:
        show_tasks(project)
        return

    if wanted_task:
        if wanted_task in pending:
            print(f"\n📌 Pending improvements for task '{wanted_task}':\n")
            for item in pending[wanted_task]:
                print(f"  • {item}")
        else:
            print(f"\n❌ Task '{wanted_task}' not found in pending tasks")
        return

    print(f"\n📌 All Pending Tasks for project {project}:\n")
    for task, improvements in pending.items():
        print(f"- {task}:")
        for item in improvements:
            print(f"  • {item}")


def add_task(project, title, category, priority, due, remind_in=None):
    doc = load_project_data(project)
    if doc is None:
        return
    if not category:
        category = "errand" if task_lib.workspace_of(doc) == "personal" else "feature"
    extra = {}
    if remind_in:
        try:
            extra["remind_at"] = task_lib.remind_in(remind_in)
        except ValueError as exc:
            print(f"\n❌ {exc}")
            return
    task = task_lib.make_task(doc, title, category=category, priority=priority, due=due or "", **extra)
    local.write_project(project.lower(), doc)
    print(f"\n✅ Added {task['id']} to {project}: {task['title']}")
    if extra:
        print(f"   🔔 Reminder at {extra['remind_at'].replace('T', ' ')}")


def set_reminder(project, task_id, delay):
    """`--remind t-003 --remind-in 12h`: start the follow-up clock now (e.g. right after a deploy)."""
    doc = load_project_data(project)
    if doc is None:
        return
    task = task_lib.find_task(doc, task_id)
    if not task:
        print(f"\n❌ Task '{task_id}' not found in {project}")
        return
    try:
        task["remind_at"] = task_lib.remind_in(delay)
    except ValueError as exc:
        print(f"\n❌ {exc}")
        return
    task.pop("dismissed", None)
    task.pop("notified", None)
    task["updated"] = task_lib.now_iso()
    local.write_project(project.lower(), doc)
    print(f"\n🔔 Will remind you about '{task['title']}' at {task['remind_at'].replace('T', ' ')}")


def finish_task(project, task_id):
    doc = load_project_data(project)
    if doc is None:
        return
    task = task_lib.find_task(doc, task_id)
    if not task:
        print(f"\n❌ Task '{task_id}' not found in {project}")
        return
    task_lib.set_status(task, "done")
    local.write_project(project.lower(), doc)
    print(f"\n🎉 Done: {task['title']}")
    if not task.get("impact"):
        print("   Tip: open the web UI and add the impact / solution so future-you can reuse it.")


# --------------------------------------------------------------------------- #
# What needs attention (and optional macOS notifications)
# --------------------------------------------------------------------------- #
LABELS = {"overdue": "⏰ overdue", "today": "📅 due today", "soon": "🗓  due soon",
          "reminder": "🔔 reminder", "blocked": "⛔ blocked"}


def notify_macos(title, message):
    if sys.platform != "darwin":
        return False
    script = 'display notification "{}" with title "{}"'.format(
        message.replace('"', "'"), title.replace('"', "'")
    )
    subprocess.run(["osascript", "-e", script], check=False)
    return True


def notify_ntfy(title, message):
    import urllib.parse
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        return False
    try:
        safe_topic = urllib.parse.quote(topic, safe="")
        safe_title = title.encode("ascii", errors="replace").decode("ascii")
        req = urllib.request.Request(
            f"https://ntfy.sh/{safe_topic}",
            data=message.encode(),
            headers={"Title": safe_title},
            method="POST",
        )
        ctx = ssl.create_default_context(cafile=_SSL_CAFILE)
        urllib.request.urlopen(req, timeout=5, context=ctx)
        return True
    except Exception:
        return False


def notify(title, message):
    notify_macos(title, message)
    notify_ntfy(title, message)


def show_due(project=None, send_notify=False, workspace=None):
    names = [project.lower()] if project else local.list_projects()
    docs = {}
    for name in names:
        try:
            doc = local.read_project(name)
        except (OSError, ValueError):
            print(f"⚠️  Skipping '{name}' (could not read it)")
            continue
        if workspace and task_lib.workspace_of(doc) != workspace:
            continue
        docs[name] = doc

    items = task_lib.attention(docs)
    if not items:
        print("\n✅ Nothing needs your attention right now")
        return

    print("\n👀 Needs your attention:\n")
    for name, task, reasons in items:
        tags = ", ".join(LABELS[r] for r in reasons)
        print(f"  {format_task(task, with_project=name)}\n      {tags}")

    if send_notify:
        touched = set()
        for name, task, reasons in items:
            remind = task.get("remind_at")
            if "reminder" in reasons and task.get("notified") != remind:
                notify("EnvFetch reminder", f"{task['title']} ({name})")
                task["notified"] = remind  # only ping once per reminder
                touched.add(name)
        for name in touched:
            local.write_project(name, docs[name])


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def build_parser():
    parser = argparse.ArgumentParser(
        description="EnvFetch - env vars, links, commands and tasks for every project, in one place"
    )

    parser.add_argument("-p", "--project", help="Project name")
    parser.add_argument("-e", "--env", help="Environment (dev, prod, staging, local)")
    parser.add_argument("-s", "--service", help="Service name (db, aws, elastic, urls etc)")

    parser.add_argument("--list", action="store_true", help="List services in environment")
    parser.add_argument("--diff", nargs=2, metavar=("ENV1", "ENV2"), help="Diff two environments")
    parser.add_argument("--create-project", help="Create new project template")
    parser.add_argument("--workspace", choices=task_lib.WORKSPACES,
                        help="With --create-project: where it lives (default office). With --due: only that workspace")

    parser.add_argument("--commands", action="store_true", help="Show project commands")
    parser.add_argument("--notes", action="store_true", help="Show project notes")

    tasks = parser.add_argument_group("tasks")
    tasks.add_argument("--tasks", action="store_true", help="Show open tasks for a project")
    tasks.add_argument("--status", choices=task_lib.STATUSES, help="Filter --tasks by status")
    tasks.add_argument("--add-task", metavar="TITLE", help="Add a task to a project")
    tasks.add_argument("--category", help="Category for --add-task (default: feature, or errand in a personal project)")
    tasks.add_argument("--priority", choices=task_lib.PRIORITIES, default="medium", help="Priority for --add-task")
    tasks.add_argument("--due-date", metavar="YYYY-MM-DD", help="Due date for --add-task")
    tasks.add_argument("--remind-in", metavar="DELAY", help="Remind me after a delay such as 30m, 12h, 2d (with --add-task or --remind)")
    tasks.add_argument("--remind", metavar="TASK_ID", help="Start a reminder clock on an existing task (use with --remind-in)")
    tasks.add_argument("--done", metavar="TASK_ID", help="Mark a task as done (e.g. t-003)")
    tasks.add_argument("--due", action="store_true", help="Show overdue / due / reminded / blocked tasks (all projects)")
    tasks.add_argument("--notify", action="store_true", help="With --due: send macOS notifications for reminders")
    tasks.add_argument("--pending_tasks", "--pending", dest="pending_tasks", action="store_true",
                       help="Show the older pending_tasks list")
    tasks.add_argument("--task", help="Filter --pending_tasks by group name")

    web = parser.add_argument_group("web UI")
    web.add_argument("--serve", action="store_true", help="Start the web UI")
    web.add_argument("--port", type=int, default=8765, help="Port for --serve (default 8765)")
    web.add_argument("--host", default="127.0.0.1", help="Host for --serve (default 127.0.0.1, local only)")
    web.add_argument("--no-open", action="store_true", help="Don't open the browser automatically")
    web.add_argument("--data-dir", help="Folder with your project JSON files (or set ENVFETCH_DATA_DIR)")
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.data_dir:
        local.set_data_dir(args.data_dir)

    # ✅ Web UI
    if args.serve:
        from server import serve
        serve(host=args.host, port=args.port, open_browser=not args.no_open)
        return

    # ✅ Create new project
    if args.create_project:
        create_project_template(args.create_project, args.workspace or "office")
        return

    # ✅ What needs attention (works without -p)
    if args.due:
        show_due(args.project, send_notify=args.notify, workspace=args.workspace)
        return

    if not args.project:
        print("\n❌ Project name is required (or run with --serve for the web UI)")
        return

    # ✅ Show project commands
    if args.commands:
        data = load_project_data(args.project)
        if data and "commands" in data["project"]:
            print_dict(data["project"]["commands"])
        return

    # ✅ Show project notes
    if args.notes:
        data = load_project_data(args.project)
        if data and "notes" in data["project"]:
            for note in data["project"]["notes"]:
                print(f"- {note}")
        return

    # ✅ Tasks
    if args.add_task:
        add_task(args.project, args.add_task, args.category, args.priority, args.due_date, args.remind_in)
        return

    if args.remind:
        if not args.remind_in:
            print("\n❌ Add --remind-in, for example: --remind t-003 --remind-in 12h")
            return
        set_reminder(args.project, args.remind, args.remind_in)
        return

    if args.done:
        finish_task(args.project, args.done)
        return

    if args.tasks:
        show_tasks(args.project, args.status)
        return

    if args.pending_tasks:
        show_legacy_pending(args.project, args.task)
        return

    # ✅ Diff environments
    if args.diff:
        diff_envs(args.project, args.diff[0], args.diff[1])
        return

    if not args.env:
        print("\n❌ Environment is required for this action")
        return

    # ✅ List services
    if args.list:
        list_services(args.project, args.env)
        return

    # ✅ Show specific service
    if args.service:
        data = load_environment_data(args.project, args.env, args.service)
        if isinstance(data, dict):
            print_dict(data)
        elif isinstance(data, list):
            for item in data:
                print(f"- {item}")

        return

    print("\n⚠️ No valid option selected")


if __name__ == "__main__":
    main()
