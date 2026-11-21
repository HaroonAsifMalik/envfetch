"""EnvFetch web UI server (standard library only).

    python envfetch.py --serve            ->  http://127.0.0.1:8765

Security model (your project files contain credentials, so this matters):
  * binds to 127.0.0.1 by default
  * rejects requests whose Host header is not the address we bound to
    (blocks DNS-rebinding attacks from other websites)
  * every write needs a custom ``X-EnvFetch`` header + JSON body, which a
    random website cannot send cross-origin (blocks CSRF)
  * project names are whitelisted (no path traversal) and files are written
    atomically with a rolling backup
"""
import json
import mimetypes
import os
import re
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from sources import local
from sources import tasks as task_lib

__version__ = "2.1.0"

UI_DIR = (Path(__file__).resolve().parent / "ui").resolve()
MAX_BODY = 5 * 1024 * 1024
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "[::1]", "::1"}
WRITE_LOCK = threading.Lock()

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")

CSP = (
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
    "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)


class Handler(BaseHTTPRequestHandler):
    server_version = f"EnvFetch/{__version__}"
    allowed_hosts = set(LOOPBACK_HOSTS)

    # -- plumbing ---------------------------------------------------------- #
    def log_message(self, fmt, *args):  # keep the terminal quiet
        pass

    def _send(self, status, body, content_type, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", CSP)
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    def _error(self, status, message):
        self._json(status, {"error": message})

    def _host_ok(self):
        host = (self.headers.get("Host") or "").strip().lower()
        if host.startswith("["):
            host = host.split("]")[0] + "]"
        elif ":" in host:
            host = host.rsplit(":", 1)[0]
        return host in self.allowed_hosts

    def _read_json(self):
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise ValueError("Content-Type must be application/json")
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("request body too large")
        raw = self.rfile.read(length) if length else b"{}"
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("body must be a JSON object")
        return data

    # -- verbs ------------------------------------------------------------- #
    def do_GET(self):
        self._dispatch("GET")

    def do_HEAD(self):
        self._dispatch("HEAD")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method):
        if not self._host_ok():
            return self._error(403, "Host not allowed")

        path = unquote(urlparse(self.path).path)

        if path.startswith("/api/"):
            if method in ("PUT", "POST") and self.headers.get("X-EnvFetch") != "1":
                return self._error(403, "Missing X-EnvFetch header")
            try:
                return self._api(method, path)
            except (ValueError, json.JSONDecodeError) as exc:
                return self._error(400, str(exc))
            except FileNotFoundError:
                return self._error(404, "Project not found")
            except Exception as exc:  # never leak a stack trace to the browser
                return self._error(500, f"{type(exc).__name__}: {exc}")

        if method in ("GET", "HEAD"):
            return self._static(path)
        return self._error(405, "Method not allowed")

    # -- API --------------------------------------------------------------- #
    def _api(self, method, path):
        if path == "/api/meta" and method == "GET":
            return self._json(200, {
                "version": __version__,
                "data_dir": str(local.PROJECTS_DIR),
                "today": task_lib.today_iso(),
            })

        if path == "/api/all" and method == "GET":
            projects, errors = {}, {}
            for name in local.list_projects():
                try:
                    projects[name] = {"doc": local.read_project(name), "rev": local.file_rev(name)}
                except (ValueError, OSError) as exc:
                    errors[name] = str(exc)
            return self._json(200, {"projects": projects, "errors": errors})

        if path == "/api/projects" and method == "POST":
            body = self._read_json()
            name = str(body.get("name", "")).strip().lower()
            if not local.is_valid_name(name):
                return self._error(400, "Use letters, numbers, '-' or '_' (max 64 chars)")
            workspace = str(body.get("workspace") or "office")
            if workspace not in task_lib.WORKSPACES:
                return self._error(400, "workspace must be 'office' or 'personal'")
            with WRITE_LOCK:
                if local.project_file(name).exists():
                    return self._error(409, "A project with that name already exists")
                doc = local.build_template(name, str(body.get("description", "")).strip(), workspace)
                local.write_project(name, doc)
                return self._json(201, {"name": name, "doc": doc, "rev": local.file_rev(name)})

        match = re.fullmatch(r"/api/projects/([a-z0-9][a-z0-9_-]*)(/import-legacy|/rename)?", path)
        if not match:
            return self._error(404, "Unknown endpoint")
        name, sub = match.group(1), match.group(2) or ""

        if method == "GET" and not sub:
            return self._json(200, {"doc": local.read_project(name), "rev": local.file_rev(name)})

        if method == "PUT" and not sub:
            body = self._read_json()
            doc = body.get("doc")
            if not isinstance(doc, dict) or not isinstance(doc.get("project", {}), dict):
                return self._error(400, "doc must be a project object")
            with WRITE_LOCK:
                if not local.project_file(name).exists():
                    return self._error(404, "Project not found")
                if str(body.get("rev")) != local.file_rev(name):
                    return self._error(409, "The file changed on disk since you loaded it")
                local.write_project(name, doc)
                return self._json(200, {"rev": local.file_rev(name)})

        if method == "DELETE" and not sub:
            with WRITE_LOCK:
                if not local.project_file(name).exists():
                    return self._error(404, "Project not found")
                local.delete_project(name)
                return self._json(200, {"deleted": name})

        if method == "POST" and sub == "/rename":
            body = self._read_json()
            new_name = str(body.get("name", "")).strip().lower()
            if not local.is_valid_name(new_name):
                return self._error(400, "Use letters, numbers, '-' or '_' (max 64 chars)")
            with WRITE_LOCK:
                if not local.project_file(name).exists():
                    return self._error(404, "Project not found")
                if local.project_file(new_name).exists():
                    return self._error(409, "A project with that name already exists")
                doc = local.read_project(name)
                local.write_project(new_name, doc)
                local.delete_project(name)
                return self._json(200, {"name": new_name, "doc": doc, "rev": local.file_rev(new_name)})

        if method == "POST" and sub == "/import-legacy":
            with WRITE_LOCK:
                doc = local.read_project(name)
                imported = task_lib.import_legacy(doc)
                local.write_project(name, doc)
                return self._json(200, {"imported": imported, "doc": doc, "rev": local.file_rev(name)})

        return self._error(405, "Method not allowed")

    # -- static UI --------------------------------------------------------- #
    def _static(self, path):
        relative = "index.html" if path in ("", "/") else path.lstrip("/")
        target = (UI_DIR / relative).resolve()
        if os.path.commonpath([str(UI_DIR), str(target)]) != str(UI_DIR) or not target.is_file():
            return self._error(404, "Not found")
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "image/svg+xml"):
            content_type += "; charset=utf-8"
        self._send(200, target.read_bytes(), content_type, {"Cache-Control": "no-cache"})


def serve(host="127.0.0.1", port=8765, open_browser=True):
    if host not in LOOPBACK_HOSTS:
        Handler.allowed_hosts = set(LOOPBACK_HOSTS) | {host.lower()}
        print("\n⚠️  Binding to a non-local address. EnvFetch has NO login and your files hold secrets.")
        print("   Only do this on a private network (e.g. Tailscale) you trust.\n")

    server, last_error = None, None
    for candidate in range(port, port + 10):
        try:
            server = ThreadingHTTPServer((host, candidate), Handler)
            break
        except OSError as exc:
            last_error = exc
    if server is None:
        raise SystemExit(f"❌ Could not bind to {host}:{port}-{port + 9} ({last_error})")

    url = f"http://{host if host != '0.0.0.0' else '127.0.0.1'}:{server.server_address[1]}"
    print(f"\n🔥 EnvFetch is running at {url}")
    print(f"   Data folder: {local.PROJECTS_DIR}")
    print("   Press Ctrl+C to stop.\n")
    if open_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Bye!")
    finally:
        server.server_close()
