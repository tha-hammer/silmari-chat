"""Closure adapter (STAGED PROPOSAL -- not wired into the repo).
Derived from the ClosureMap for: PreToolUse workspace-boundary gating (AF-hro9/AF-j8s3).
Pin: 31460c975fce7ded9f1de4aeb8c74022a6796391 (silmari-chat).
Promote into silmari-chat and complete each TODO(promote) before use.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys

ASYNC_EDGES = []                                    # this map's single edge is synchronous
CONNECTOR = {e: True for e in ASYNC_EDGES}
SINK = []                                            # Phase-0 /seed_sink target
LAST_HOOK = {"fn": None}                             # holds the returned preToolUseHook closure

def handle(op, p):
    if op == "/reset":
        SINK.clear()
        LAST_HOOK["fn"] = None
        CONNECTOR.update({e: True for e in ASYNC_EDGES})
        return {"ok": True}
    if op == "/set_connector":
        CONNECTOR[p["edge"]] = p["enabled"]
        return {"ok": True}
    if op == "/seed_sink":
        SINK.append(p["value"])
        return {"ok": True}
    if op == "/seed":
        # TODO(promote): construct a fixture ServerRequest with req.user.id set,
        # matching resolveClaudeAgentSdkWorkspace's contract
        #   (packages/api/src/endpoints/custom/initialize.ts:198-215)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): call initializeClaudeAgentSdk({endpoint, req, endpointConfig,
        #   model_parameters, appConfig}) with the seeded fixture request
        #   (packages/api/src/endpoints/custom/initialize.ts:365-400);
        #   capture result.runtimeOptions.preToolUseHook into LAST_HOOK["fn"]
        return {"ok": True}
    if op == "/drive":
        # no async edges in this map -- no-op
        return {"ok": True}
    if op == "/observe":
        # TODO(promote): invoke LAST_HOOK["fn"](p["toolInput"], abortSignal) --
        #   e.g. {toolName: "Bash", toolInput: {command: "cat /etc/passwd"}} --
        #   and return its {decision, reason} as the observed value
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
