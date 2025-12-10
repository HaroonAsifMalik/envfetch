import argparse
from sources.local import (
    load_environment_data,
    load_project_data,
    list_services,
    diff_envs,
    create_project_template
)


def print_dict(data):
    for k, v in data.items():
        print(f"{k}: {v}")


def main():
    parser = argparse.ArgumentParser(description="EnvFetch - simple env & project info tool")

    parser.add_argument("-p", "--project", help="Project name")
    parser.add_argument("-e", "--env", help="Environment (dev, prod, staging, local)")
    parser.add_argument("-s", "--service", help="Service name (db, aws, elastic, urls etc)")

    parser.add_argument("--list", action="store_true", help="List services in environment")
    parser.add_argument("--diff", nargs=2, metavar=("ENV1", "ENV2"), help="Diff two environments")
    parser.add_argument("--create-project", help="Create new project template")

    parser.add_argument("--commands", action="store_true", help="Show project commands")
    parser.add_argument("--notes", action="store_true", help="Show project notes")

    parser.add_argument("--pending_tasks", action="store_true", help="Show pending tasks")
    parser.add_argument("--task", help="Filter pending tasks by task name")


    args = parser.parse_args()

    # ✅ Create new project
    if args.create_project:
        create_project_template(args.create_project)
        return

    if not args.project:
        print("\n❌ Project name is required")
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


    # ✅ Show pending tasks
    if args.pending_tasks:
        data = load_project_data(args.project)
        pending = data["project"]["pending_tasks"]

        if not pending:
            print("\n✅ No pending tasks found")
            return

        if args.task:
            task_name = args.task
            if task_name in pending:
                print(f"\n📌 Pending improvements for task '{task_name}':\n")
                for item in pending[task_name]:
                    print(f"  • {item}")
            else:
                print(f"\n❌ Task '{task_name}' not found in pending tasks")
        else:
            print(f"\n📌 All Pending Tasks for project {args.project}:\n")
            for task, improvements in pending.items():
                print(f"- {task}:")
                for item in improvements:
                    print(f"  • {item}")
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
