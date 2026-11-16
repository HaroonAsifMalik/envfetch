# EnvFetch cheat sheet

## Web UI
python envfetch.py --serve                       # http://127.0.0.1:8765
python envfetch.py --serve --port 9000 --no-open
python envfetch.py --serve --data-dir ~/private/envfetch-data

## Projects
python envfetch.py --create-project blog

## Environments
python envfetch.py -p temp-project -e dev --list           # list services
python envfetch.py -p temp-project -e dev -s db            # get db variables
python envfetch.py -p temp-project -e dev -s urls          # get urls
python envfetch.py -p temp-project --diff dev prod         # diff environments

## Commands & notes
python envfetch.py -p temp-project --commands
python envfetch.py -p temp-project --notes

## Tasks
python envfetch.py -p temp-project --tasks
python envfetch.py -p temp-project --tasks --status blocked
python envfetch.py -p temp-project --add-task "Fix sitemap" --category bug --priority high --due-date 2026-11-20
python envfetch.py -p temp-project --done t-003
python envfetch.py --due                          # everything that needs attention
python envfetch.py --due --notify                 # + macOS notifications for reminders
python envfetch.py -p temp-project --pending_tasks   # older pending_tasks list

## Tests
python -m unittest discover -s tests -v
