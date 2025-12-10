# create new project
python envfetch.py --create-project blog

# list services
python envfetch.py -p olx -e dev --list

# get db variables
python envfetch.py -p olx -e dev -s db

# get urls
python envfetch.py -p olx -e dev -s urls

# get project commands (global)
python envfetch.py -p olx --commands

# get notes
python envfetch.py -p olx --notes

# diff environments
python envfetch.py -p olx --diff dev prod
