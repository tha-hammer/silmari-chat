"""Closure adapter (STAGED PROPOSAL — not wired into the repo).
Derived from the ClosureMap for: PerplexityResearcher request -> citation-backed result.
Pin: 9d23b2fd703d2c6352e31f5974e0e692590371cd.
Promote into /home/maceo/Dev/silmari-chat and complete each TODO(promote) before use.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys
ASYNC_EDGES = []                                   # this chain has no queue/scheduler edges
CONNECTOR = {}
SINK = []                                           # Phase-0 /seed_sink target (aggregate stdout)

def handle(op, p):
    if op == "/reset":        SINK.clear(); return {"ok": True}
    if op == "/set_connector": CONNECTOR[p["edge"]] = p["enabled"]; return {"ok": True}
    if op == "/seed_sink":     SINK.append(p["value"]); return {"ok": True}
    if op == "/seed":
        # TODO(promote): set process.env.PERPLEXITY_API_KEY = p["data"]
        #                (skills/Research/Workflows/PerplexityResearch.md:47)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): run `bun skills/Research/Workflows/PerplexityResearch.md p["args"]["question"]`
        #                as a subprocess and capture stdout into SINK
        #                (skills/Research/Workflows/PerplexityResearch.md:9-12, 146-192)
        return {"ok": True}
    if op == "/drive":
        return {"ok": True}                          # no async edges to drive
    if op == "/observe":
        # TODO(promote): return the captured subprocess stdout from /trigger
        #                (skills/Research/Workflows/PerplexityResearch.md:158-187)
        return {"ok": True, "value": json.dumps(SINK)}
    return {"ok": False, "error": "unknown op"}

class Hn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        out = json.dumps(handle(self.path, json.loads(self.rfile.read(n) or "{}"))).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Hn).serve_forever()
