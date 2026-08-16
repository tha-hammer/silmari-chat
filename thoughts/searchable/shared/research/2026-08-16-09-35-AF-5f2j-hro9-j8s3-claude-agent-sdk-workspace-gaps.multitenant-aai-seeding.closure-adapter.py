"""Closure adapter (STAGED PROPOSAL -- not wired into the repo).
Derived from the ClosureMap for: multiTenant AAI seeding (AF-5f2j).
Pin: 0713b9a1badf947d5216e0cb3850b7eba00f3ea1 (silmari-chat-agents).
Promote into silmari-chat-agents and complete each TODO(promote) before use.
NOTE: no production entrypoint exists for this chain yet (see caveat in the
research doc) -- /trigger below calls the ChatClaudeAgentSDK constructor +
a query() invocation directly, matching the only reachable caller today
(a unit test), not an HTTP-triggered production path.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys

ASYNC_EDGES = []                                    # both edges in this map are synchronous
CONNECTOR = {e: True for e in ASYNC_EDGES}
SINK = []                                            # Phase-0 /seed_sink target
STATE = {"instance": None}

def handle(op, p):
    if op == "/reset":
        SINK.clear()
        STATE["instance"] = None
        CONNECTOR.update({e: True for e in ASYNC_EDGES})
        return {"ok": True}
    if op == "/set_connector":
        CONNECTOR[p["edge"]] = p["enabled"]
        return {"ok": True}
    if op == "/seed_sink":
        SINK.append(p["value"])
        return {"ok": True}
    if op == "/seed":
        # TODO(promote): stage p["data"] as ClaudeAgentSDKClientOptions --
        #   { multiTenant: true, aaiTemplateDir: <fixture dir>, cwd: <fixture cwd> }
        #   (src/llm/claudeAgentSdk/types.ts:41-122)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): new ChatClaudeAgentSDK(seededOptions), then invoke a
        #   query()-triggering call (e.g. _streamResponseChunks) so
        #   perTenantConfigDir()/resolveAaiTemplateDir() actually run
        #   (src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:220-306,410-441)
        return {"ok": True}
    if op == "/drive":
        # no async edges in this map -- no-op
        return {"ok": True}
    if op == "/observe":
        # TODO(promote): read back the seeded tenant dir's contents
        #   (tmpdir()/claude-agent-sdk-tenants/<hash>/, e.g. CLAUDE.md presence)
        #   and the settingSources value passed into the captured queryFn() call
        return {"ok": True, "value": json.dumps(SINK)}
    return {"ok": False, "error": "unknown op"}

class Hn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        out = json.dumps(handle(self.path, json.loads(self.rfile.read(n) or "{}"))).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)
    def log_message(self, *a):
        pass

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Hn).serve_forever()
