# ⚡ EnvFetch

**One place for everything about every project you work on:** environment variables, links, commands, notes, and tasks, with the steps you took and the impact you had.

No database. No `pip install`. No build step. Your data stays in plain JSON files you own.

![Home dashboard](docs/home.png)

## Why

Working on several projects means constantly re-finding the same things: *which URL is the staging admin? what's the prod Redis host? how did I fix that migration last time? what was I supposed to check after yesterday's deploy?*

EnvFetch keeps all of it together, searchable in a keystroke, and nudges you about what you'd otherwise forget.

## Quick start

```bash
git clone https://github.com/HaroonAsifMalik/envfetch.git
cd envfetch
python envfetch.py --serve          # opens http://127.0.0.1:8765
```

Requires Python 3.8+. Nothing else. (The CLI works exactly as before; see [CLI](#cli).)

## What you get

### 🧭 Two workspaces: Office and Personal
Switch at the top of the sidebar (or press `W`). **Office** is for work projects (environments, links, commands, tasks). **Personal** is for everything else (a move, health, money, a course) with life-friendly categories and no environment clutter. Each workspace has its own colour, its own home page and its own standup, and the other one shows a badge when something there needs you. Opening a project from search switches workspace for you.

![Personal workspace](docs/personal.png)

### 🏠 Home: everything that needs you today
Overdue, due today, blocked, and reminders that have fired, all on one page. Capture a task in one line:

```
Upgrade DB to PG16 !high #chore @friday ~12h
```

`!low|medium|high|urgent` sets priority, `#word` sets the category, `@today`, `@tomorrow`, `@fri`, `@+3d` or `@2026-12-01` sets the due date, and `~30m`, `~12h`, `~2d` sets a reminder that long from now.

### ⏰ "Remind me 12 hours after I deploy"
Every task has reminder presets (1 hour, 4 hours, 12 hours, 2 days, tomorrow 9am, or type your own like `6h`) with a live countdown. Due reminders pop up as a notice, show a count in the browser tab title, and sit on Home with *Snooze* and *Dismiss*. From the terminal, start the clock right after a deploy:

```bash
python envfetch.py -p task-master --remind t-004 --remind-in 12h
```

### 📝 Write my update (press `S`)
Generates a **daily standup** (yesterday or since Friday, today, blockers) or a **weekly update** (done with impact, in progress, coming up, blockers) from your tasks, ready to paste into chat.

![Standup](docs/standup.png)

### 🔁 "You have done something like this before"
While you type a new task title, EnvFetch looks through your finished tasks and shows similar ones with their solution, challenges and steps. One click reuses the steps.

![Similar past tasks and reminder presets](docs/similar.png)

### ✅ Tasks that remember how you did them
A board (drag cards between columns) or a list, per project. Each task has:

| | |
|---|---|
| **Status** | To do · In progress · Blocked · In review · Done |
| **Priority, category, due date** | with overdue / due-today highlighting |
| **Reminder** | "remind me tomorrow 9am" (snooze or dismiss from Home) |
| **Steps** | a checklist; paste a whole list and it splits into steps |
| **Notes & links** | context, PR, ticket, dashboard |
| **Write-up** | **Impact**, **Challenges**, **Solution**: the reusable playbook |

![Task board](docs/board.png)

Finished tasks with an impact collect under **Wins & learnings** on each project, with a one-click *Copy all as Markdown*. It's ready-made material for interviews, client pitches and your portfolio.

![Task write-up](docs/task-writeup.png)

### 🔐 Environments, safely
Switch `local / dev / staging / prod`. Secrets are **masked by default** (anything that looks like a key, token, password, or a URL with credentials). Reveal one for 20 seconds, copy it, or copy a whole service or environment as a `.env`. Production gets a red warning banner. Edit values inline.

**Compare** any two environments side by side: what's missing, what differs, what matches.

![Environments](docs/environments.png)

### 🔎 `⌘K` finds anything
One search across projects, tasks (including their write-ups), service and variable **names**, links, commands and notes. Secret values are never indexed or shown in search.

### Also
- **Links**, plus URLs already stored in your environments, shown but never duplicated
- **Commands**: click to copy
- **Notes**
- Light and dark themes (light by default), works on a phone-width screen, keyboard shortcuts (press `?`)
- Edits made in the terminal show up in the UI when you switch back to it

## Your data

One file per project in `projects/`, for example `projects/task-master.json`:

```jsonc
{
  "project": {
    "description": "TaskMaster Project Services",
    "workspace": "office",
    "commands": { "migrate": "python manage.py migrate" },
    "notes": ["Redis must be running for Celery tasks."],
    "links": [{ "title": "Grafana", "url": "https://grafana.example.com" }],
    "tasks": [
      {
        "id": "t-001", "title": "Speed up the project list endpoint",
        "status": "done", "priority": "high", "category": "improvement",
        "due": "", "remind_at": "",
        "steps": [{ "text": "Fix N+1 with annotate(Count)", "done": true }],
        "impact": "Cut load time from 9s to 1.4s",
        "challenges": "select_related made it worse at first",
        "solution": "Annotate the count, add a composite index, cache page 1",
        "completed_on": "2026-11-10"
      }
    ]
  },
  "local": { "db": { "DATABASE_URL": "postgres://user:pass@localhost:5432/app" } },
  "prod":  { "db": { "DATABASE_URL": "postgres://..." }, "urls": { "ADMIN": "https://admin.example.com" } }
}
```

`workspace` is `"office"` or `"personal"`; files without it count as office. Every top-level key other than `project` is an environment, and each environment holds services (`db`, `redis`, `aws`, `urls`…) of `KEY: value` pairs. You can edit the JSON by hand any time, and the UI and CLI always agree because they share the same code.

**Upgrading from the old format?** If a project still has `pending_tasks`, the Tasks tab shows a banner: *Import as tasks*. Nothing is lost, and the old `--pending_tasks` command still works.

### Keep your secrets out of public GitHub
The two files in `projects/` are **examples**. For real work, keep your data in a **private** folder or repo:

```bash
export ENVFETCH_DATA_DIR=~/private/envfetch-data     # add to your shell profile
# or per run:
python envfetch.py --serve --data-dir ~/private/envfetch-data
```

Safety net: every save is atomic, and a rolling backup (max one per 5 minutes, last 10 kept) goes to `.backups/`, which is git-ignored.

## CLI

All the original commands still work:

```bash
python envfetch.py -p task-master -e dev -s db        # get variables
python envfetch.py -p task-master -e dev --list       # list services
python envfetch.py -p task-master --diff dev prod     # compare environments
python envfetch.py -p task-master --commands          # project commands
python envfetch.py -p task-master --notes             # project notes
python envfetch.py --create-project blog              # new office project
python envfetch.py --create-project moving --workspace personal   # new personal project
```

New task commands:

```bash
python envfetch.py -p task-master --tasks                          # open tasks
python envfetch.py -p task-master --tasks --status blocked
python envfetch.py -p task-master --add-task "Rotate Redis password" --category chore --priority urgent --due-date 2026-11-20
python envfetch.py -p task-master --done t-004                     # mark done
python envfetch.py --add-task "Check error rate" -p task-master --remind-in 12h   # with a reminder
python envfetch.py -p task-master --remind t-004 --remind-in 90m   # start a reminder clock now
python envfetch.py --due                                           # what needs me now? (all projects)
python envfetch.py --due --workspace personal                      # only personal
```

### Reminders on macOS

`--due --notify` sends a macOS notification for each reminder that has come due (once per reminder). Run it every 15 minutes with a LaunchAgent. Save this as `~/Library/LaunchAgents/com.envfetch.due.plist` (fix the paths), then `launchctl load ~/Library/LaunchAgents/com.envfetch.due.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.envfetch.due</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string><string>/Users/YOU/envfetch/envfetch.py</string>
    <string>--due</string><string>--notify</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>ENVFETCH_DATA_DIR</key><string>/Users/YOU/private/envfetch-data</string>
  </dict>
  <key>StartInterval</key><integer>900</integer>
</dict></plist>
```

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` or `/` | Search everything |
| `N` | New task |
| `W` | Switch Office / Personal |
| `S` | Write my standup |
| `G` | Go home |
| `T` | Toggle light / dark |
| `⌘↵` | Save the task you're editing |
| `?` | Show shortcuts |

## Security

Your files contain credentials, so the server is deliberately cautious:

- Listens on `127.0.0.1` only, and rejects requests with an unexpected `Host` header (blocks DNS-rebinding)
- Writes need a custom header plus a JSON body, so other websites can't send them (blocks CSRF)
- Project names are whitelisted (`a-z 0-9 - _`), so there is no path traversal
- A write based on a stale copy is refused (`409`), so the UI and your terminal can't overwrite each other
- Strict Content-Security-Policy, and the UI never inserts your data as HTML

`--host` lets you bind another address (for example a [Tailscale](https://tailscale.com) IP, to use it from your phone). There is **no login**, so only do that on a network you trust.

## Development

```
envfetch.py          CLI entry point
server.py            web server + JSON API (stdlib http.server)
sources/local.py     reading/writing project files (the only code that touches disk)
sources/tasks.py     task model, deadlines, reminders
ui/                  the web app: plain HTML/CSS and ES modules, no build step
  js/store.js        state, API client, workspaces, task and reminder logic
  js/similar.js      "done before" matching   js/standup.js  update generator
  js/*.js            one file per screen (home, project, tasks, envs, misc, search)
tests/               python -m unittest discover -s tests -v
                     node --test tests/js/*.test.mjs   (Node 18+, only for the UI logic tests)
```

Change the look by editing the variables at the top of `ui/style.css`; the two `[data-ws]` blocks set each workspace's colour. Add a workspace colour or category list in `WS_META` (`ui/js/store.js`). Add a field to tasks in `sources/tasks.py` (`make_task`) and `ui/js/store.js` (`blankTask`), then add an input in `openTaskModal` in `ui/js/tasks.js`.
