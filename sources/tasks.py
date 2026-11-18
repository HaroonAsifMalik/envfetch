"""Task model shared by the CLI and the web server.

Tasks live inside each project file at ``project.tasks``. Every task looks like:

    {
      "id": "t-014",            "title": "Upgrade DB to PG16",
      "status": "todo|doing|blocked|review|done",
      "priority": "low|medium|high|urgent",
      "category": "feature|bug|improvement|chore|research|...",
      "due": "2026-11-20",      "remind_at": "2026-11-21T09:00",
      "notes": "", "links": ["https://..."],
      "steps": [{"text": "Backup prod", "done": true}],
      "impact": "", "challenges": "", "solution": "",       <- the write-up
      "created": "...", "updated": "...", "completed_on": ""
    }
"""
import re
from datetime import date, datetime, timedelta


STATUSES = ("todo", "doing", "blocked", "review", "done")
PRIORITIES = ("low", "medium", "high", "urgent")
STATUS_MARK = {"todo": "○", "doing": "◐", "blocked": "✖", "review": "◎", "done": "●"}
PRIORITY_RANK = {"urgent": 0, "high": 1, "medium": 2, "low": 3}

_LEGACY_CATEGORY = {
    "features": "feature",
    "bugs": "bug",
    "improvements": "improvement",
    "chores": "chore",
}


WORKSPACES = ("office", "personal")
_DELAY_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?)$", re.I)


def workspace_of(doc):
    """Which workspace a project belongs to. Older files have none: they are 'office'."""
    value = (doc.get("project") or {}).get("workspace")
    return value if value in WORKSPACES else "office"


def parse_delay(text):
    """'30m' / '12h' / '2d' / '1w' -> timedelta, or None if it is not understood."""
    match = _DELAY_RE.match(str(text or "").strip())
    if not match:
        return None
    amount, unit = float(match.group(1)), match.group(2).lower()
    if unit.startswith("m"):
        return timedelta(minutes=amount)
    if unit.startswith("h"):
        return timedelta(hours=amount)
    if unit.startswith("d"):
        return timedelta(days=amount)
    return timedelta(weeks=amount)


def remind_in(text, now=None):
    """The ``remind_at`` value for 'N minutes/hours/days from now'."""
    delta = parse_delay(text)
    if delta is None:
        raise ValueError("Use a delay like 30m, 12h, 2d or 1w")
    return ((now or datetime.now()) + delta).strftime("%Y-%m-%dT%H:%M")


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def today_iso():
    return date.today().isoformat()


# --------------------------------------------------------------------------- #
# Creating / finding tasks
# --------------------------------------------------------------------------- #
def get_tasks(doc):
    project = doc.setdefault("project", {})
    return project.setdefault("tasks", [])


def next_task_id(tasks):
    numbers = []
    for task in tasks:
        match = re.fullmatch(r"t-(\d+)", str(task.get("id", "")))
        if match:
            numbers.append(int(match.group(1)))
    return "t-%03d" % (max(numbers, default=0) + 1)


def make_task(doc, title, category="feature", priority="medium", due="", status="todo", **extra):
    tasks = get_tasks(doc)
    stamp = now_iso()
    task = {
        "id": next_task_id(tasks),
        "title": title.strip(),
        "status": status,
        "priority": priority,
        "category": category,
        "due": due,
        "remind_at": "",
        "notes": "",
        "links": [],
        "steps": [],
        "impact": "",
        "challenges": "",
        "solution": "",
        "created": stamp,
        "updated": stamp,
        "completed_on": today_iso() if status == "done" else "",
    }
    task.update(extra)
    tasks.append(task)
    return task


def find_task(doc, task_id):
    for task in get_tasks(doc):
        if task.get("id") == task_id:
            return task
    return None


def set_status(task, status):
    task["status"] = status
    task["updated"] = now_iso()
    if status == "done":
        task["completed_on"] = task.get("completed_on") or today_iso()
    else:
        task["completed_on"] = ""


def step_progress(task):
    steps = task.get("steps") or []
    done = sum(1 for s in steps if s.get("done"))
    return done, len(steps)


# --------------------------------------------------------------------------- #
# Legacy `pending_tasks` ({"features": ["..."], "bugs": ["..."]}) -> real tasks
# --------------------------------------------------------------------------- #
def legacy_items(doc):
    pending = (doc.get("project") or {}).get("pending_tasks") or {}
    items = []
    if isinstance(pending, dict):
        for group, entries in pending.items():
            entries = entries if isinstance(entries, list) else [entries]
            items.extend((str(group), str(text).strip()) for text in entries if str(text).strip())
    elif isinstance(pending, list):
        items.extend(("general", str(text).strip()) for text in pending if str(text).strip())
    return items


def import_legacy(doc):
    """Convert ``project.pending_tasks`` into tasks and drop the old key."""
    items = legacy_items(doc)
    for group, text in items:
        category = _LEGACY_CATEGORY.get(group.lower(), group.lower())
        make_task(doc, text, category=category)
    doc.setdefault("project", {}).pop("pending_tasks", None)
    return len(items)


# --------------------------------------------------------------------------- #
# Deadlines & reminders
# --------------------------------------------------------------------------- #
def due_state(task, today=None):
    """'overdue' | 'today' | 'soon' (within 3 days) | ''."""
    if task.get("status") == "done" or not task.get("due"):
        return ""
    today = today or today_iso()
    if task["due"] < today:
        return "overdue"
    if task["due"] == today:
        return "today"
    soon = (date.fromisoformat(today) + timedelta(days=3)).isoformat()
    return "soon" if task["due"] <= soon else ""


def reminder_due(task, now=None):
    """True once ``remind_at`` has passed and it has not been dismissed."""
    remind = task.get("remind_at") or ""
    if not remind or task.get("status") == "done" or task.get("dismissed") == remind:
        return False
    now = now or datetime.now().strftime("%Y-%m-%dT%H:%M")
    return remind[:16] <= now


def attention(projects):
    """Everything that needs a human, across all projects.

    ``projects`` maps name -> project dict. Returns a list of
    ``(project_name, task, reasons)`` sorted by urgency.
    """
    found = []
    for name, doc in projects.items():
        for task in get_tasks(doc):
            if task.get("status") == "done":
                continue
            reasons = []
            state = due_state(task)
            if state:
                reasons.append(state)
            if reminder_due(task):
                reasons.append("reminder")
            if task.get("status") == "blocked":
                reasons.append("blocked")
            if reasons:
                found.append((name, task, reasons))

    order = {"overdue": 0, "reminder": 1, "today": 2, "blocked": 3, "soon": 4}
    found.sort(key=lambda row: (min(order[r] for r in row[2]), PRIORITY_RANK.get(row[1].get("priority"), 2)))
    return found
