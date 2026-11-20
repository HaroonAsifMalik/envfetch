"""Run with:  python -m unittest discover -s tests -v   (standard library only)"""
import http.client
import json
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sources import local  # noqa: E402
from sources import tasks as T  # noqa: E402
import server  # noqa: E402


class TaskLogic(unittest.TestCase):
    def test_ids_increment_and_survive_gaps(self):
        doc = {"project": {}}
        self.assertEqual(T.make_task(doc, "a")["id"], "t-001")
        self.assertEqual(T.make_task(doc, "b")["id"], "t-002")
        doc["project"]["tasks"][0]["id"] = "t-009"
        self.assertEqual(T.make_task(doc, "c")["id"], "t-010")

    def test_set_status_tracks_completion(self):
        task = T.make_task({"project": {}}, "x")
        T.set_status(task, "done")
        self.assertEqual(task["completed_on"], T.today_iso())
        T.set_status(task, "doing")
        self.assertEqual(task["completed_on"], "")

    def test_due_state(self):
        self.assertEqual(T.due_state({"status": "todo", "due": "2026-01-01"}, "2026-01-02"), "overdue")
        self.assertEqual(T.due_state({"status": "todo", "due": "2026-01-02"}, "2026-01-02"), "today")
        self.assertEqual(T.due_state({"status": "todo", "due": "2026-01-04"}, "2026-01-02"), "soon")
        self.assertEqual(T.due_state({"status": "todo", "due": "2026-02-01"}, "2026-01-02"), "")
        self.assertEqual(T.due_state({"status": "done", "due": "2020-01-01"}, "2026-01-02"), "")

    def test_reminders_fire_once_dismissed(self):
        task = {"status": "todo", "remind_at": "2026-01-01T09:00"}
        self.assertTrue(T.reminder_due(task, now="2026-01-01T09:00"))
        self.assertFalse(T.reminder_due(task, now="2026-01-01T08:59"))
        task["dismissed"] = "2026-01-01T09:00"
        self.assertFalse(T.reminder_due(task, now="2026-01-02T09:00"))
        task["remind_at"] = "2026-01-03T09:00"  # snoozed to a new time -> fires again
        self.assertTrue(T.reminder_due(task, now="2026-01-03T09:00"))

    def test_import_legacy(self):
        doc = {"project": {"pending_tasks": {"features": ["A", "B"], "bugs": ["C"], "sitemap": ["D"]}}}
        self.assertEqual(T.import_legacy(doc), 4)
        tasks = doc["project"]["tasks"]
        self.assertEqual([t["category"] for t in tasks], ["feature", "feature", "bug", "sitemap"])
        self.assertNotIn("pending_tasks", doc["project"])

    def test_attention_orders_overdue_first(self):
        docs = {"p": {"project": {"tasks": []}}}
        T.make_task(docs["p"], "soon", due=(T.date.today() + T.timedelta(days=2)).isoformat())
        T.make_task(docs["p"], "late", due="2000-01-01")
        T.make_task(docs["p"], "blocked", status="blocked")
        T.make_task(docs["p"], "fine")
        found = [(task["title"], reasons) for _, task, reasons in T.attention(docs)]
        self.assertEqual([title for title, _ in found], ["late", "blocked", "soon"])


class Workspaces(unittest.TestCase):
    def test_old_files_without_a_workspace_are_office(self):
        self.assertEqual(T.workspace_of({"project": {}}), "office")
        self.assertEqual(T.workspace_of({}), "office")
        self.assertEqual(T.workspace_of({"project": {"workspace": "personal"}}), "personal")
        self.assertEqual(T.workspace_of({"project": {"workspace": "nonsense"}}), "office")

    def test_template_per_workspace(self):
        office = local.build_template("api")
        personal = local.build_template("move", workspace="personal")
        self.assertEqual(office["project"]["workspace"], "office")
        self.assertIn("prod", office)
        self.assertEqual(personal["project"]["workspace"], "personal")
        self.assertNotIn("prod", personal)  # no environments for life stuff


class RelativeReminders(unittest.TestCase):
    def test_parse_delay(self):
        self.assertEqual(T.parse_delay("30m").total_seconds(), 1800)
        self.assertEqual(T.parse_delay("12h").total_seconds(), 12 * 3600)
        self.assertEqual(T.parse_delay("2 days").total_seconds(), 2 * 86400)
        self.assertEqual(T.parse_delay("1w").total_seconds(), 7 * 86400)
        self.assertIsNone(T.parse_delay("soon"))
        self.assertIsNone(T.parse_delay(""))

    def test_remind_in(self):
        now = datetime(2026, 11, 18, 11, 0)
        self.assertEqual(T.remind_in("12h", now), "2026-11-18T23:00")
        self.assertEqual(T.remind_in("90m", now), "2026-11-18T12:30")
        with self.assertRaises(ValueError):
            T.remind_in("later", now)


class Storage(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = local.PROJECTS_DIR
        local.set_data_dir(self.tmp.name)

    def tearDown(self):
        local.PROJECTS_DIR = self.old
        self.tmp.cleanup()

    def test_names_are_whitelisted(self):
        for bad in ("", "../etc", "a/b", "Has Space", "-lead", "x" * 65):
            self.assertFalse(local.is_valid_name(bad), bad)
        for good in ("blog", "task-master", "a_1"):
            self.assertTrue(local.is_valid_name(good), good)

    def test_write_is_atomic_and_backs_up(self):
        local.write_project("demo", {"project": {"description": "v1"}})
        local.write_project("demo", {"project": {"description": "v2"}})
        self.assertEqual(local.read_project("demo")["project"]["description"], "v2")
        backups = list((Path(self.tmp.name) / ".backups").glob("demo.*.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(json.loads(backups[0].read_text())["project"]["description"], "v1")
        self.assertEqual([p.name for p in Path(self.tmp.name).glob("*.tmp")], [])  # no stray temp files

    def test_list_projects_ignores_junk(self):
        local.write_project("real", {"project": {}})
        (Path(self.tmp.name) / "Not Valid.json").write_text("{}")
        self.assertEqual(local.list_projects(), ["real"])


class ServerSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.old = local.PROJECTS_DIR
        local.set_data_dir(cls.tmp.name)
        local.write_project("demo", {"project": {"pending_tasks": {"bugs": ["fix me"]}}, "dev": {"db": {"URL": "x"}}})
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        local.PROJECTS_DIR = cls.old
        cls.tmp.cleanup()

    def call(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        merged = {"Content-Type": "application/json", "X-EnvFetch": "1"}
        merged.update(headers or {})
        conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=merged)
        res = conn.getresponse()
        raw = res.read()
        conn.close()
        try:
            return res.status, json.loads(raw)
        except ValueError:
            return res.status, raw

    def test_serves_ui(self):
        status, body = self.call("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"EnvFetch", body)

    def test_rejects_foreign_host_header(self):  # DNS-rebinding defence
        status, _ = self.call("GET", "/api/all", headers={"Host": "evil.example.com"})
        self.assertEqual(status, 403)

    def test_writes_need_custom_header(self):  # CSRF defence
        status, _ = self.call("PUT", "/api/projects/demo", {"doc": {"project": {}}, "rev": "1"}, headers={"X-EnvFetch": "0"})
        self.assertEqual(status, 403)

    def test_path_traversal_blocked(self):
        for path in ("/../server.py", "/%2e%2e/server.py", "/..%2fserver.py"):
            status, _ = self.call("GET", path)
            self.assertEqual(status, 404, path)

    def test_stale_write_is_refused(self):
        status, data = self.call("GET", "/api/projects/demo")
        self.assertEqual(status, 200)
        status, _ = self.call("PUT", "/api/projects/demo", {"doc": data["doc"], "rev": "stale"})
        self.assertEqual(status, 409)
        status, saved = self.call("PUT", "/api/projects/demo", {"doc": data["doc"], "rev": data["rev"]})
        self.assertEqual(status, 200)
        self.assertNotEqual(saved["rev"], data["rev"])

    def test_create_project_validates_and_rejects_duplicates(self):
        self.assertEqual(self.call("POST", "/api/projects", {"name": "../x"})[0], 400)
        self.assertEqual(self.call("POST", "/api/projects", {"name": "fresh"})[0], 201)
        self.assertEqual(self.call("POST", "/api/projects", {"name": "fresh"})[0], 409)

    def test_create_project_with_workspace(self):
        status, data = self.call("POST", "/api/projects", {"name": "flat-move", "workspace": "personal"})
        self.assertEqual(status, 201)
        self.assertEqual(data["doc"]["project"]["workspace"], "personal")
        self.assertNotIn("prod", data["doc"])
        status, data = self.call("POST", "/api/projects", {"name": "shop-api", "workspace": "office"})
        self.assertEqual(data["doc"]["project"]["workspace"], "office")
        self.assertIn("prod", data["doc"])

    def test_create_project_rejects_unknown_workspace(self):
        self.assertEqual(self.call("POST", "/api/projects", {"name": "odd", "workspace": "hobby"})[0], 400)

    def test_import_legacy_endpoint(self):
        status, data = self.call("POST", "/api/projects/demo/import-legacy", {})
        self.assertEqual(status, 200)
        self.assertEqual(data["imported"], 1)
        self.assertEqual(data["doc"]["project"]["tasks"][0]["title"], "fix me")


if __name__ == "__main__":
    unittest.main()
