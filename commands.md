# create new project
python envfetch.py --create-project blog

# list services
python envfetch.py -p temp-project -e dev --list

# get db variables
python envfetch.py -p temp-project -e dev -s db

# get urls
python envfetch.py -p temp-project -e dev -s urls

# get project commands (global)
python envfetch.py -p temp-project --commands

# get notes
python envfetch.py -p temp-project --notes

# diff environments
python envfetch.py -p temp-project --diff dev prod
