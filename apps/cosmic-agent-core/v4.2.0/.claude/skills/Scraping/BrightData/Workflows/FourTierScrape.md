# Four-Tier URL Content Scraping

## Voice Notification

```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running the FourTierScrape workflow in the BrightData skill to scrape URL content"}' \
  > /dev/null 2>&1 &
```

Running **FourTierScrape** in **BrightData**...

---

**Purpose:** Progressive escalation strategy to retrieve URL content using four fallback tiers

**When to Use:**
- User requests scraping or fetching content from any URL
- Standard methods are failing or blocked
- Site has bot detection or access restrictions
- Need reliable content extraction in markdown format

**Prerequisites:**
- URL to scrape (provided by user)
- WebFetch tool (built-in)
- Bash tool for curl commands
- Markdown Web Browser server at ~/Dev/markdown_web_browser (Tier 3)
- Bright Data MCP available (Tier 4)

---

## Workflow Steps

### Step 1: Tier 1 - WebFetch (Fast & Simple)

**Description:** Attempt to fetch URL using Claude Code's built-in WebFetch tool

**Actions:**
```
Use WebFetch tool with:
- URL: [user-provided URL]
- Prompt: "Extract all content from this page and convert to markdown"
```

**Expected Outcomes:**
- **Success:** Content retrieved in markdown format → Skip to Step 5 (Output)
- **Failure:** WebFetch blocked, timeout, or error → Proceed to Step 2 (Tier 2)

**Typical Success Cases:**
- Public websites without bot detection
- Simple content sites
- Sites with permissive access policies

**Typical Failure Cases:**
- Sites with user-agent filtering
- Sites with basic bot detection
- Sites requiring specific headers

---

### Step 2: Tier 2 - Customized Curl (Chrome-like Headers)

**Description:** Use curl with comprehensive Chrome browser headers to bypass basic bot detection

**Actions:**
```bash
curl -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  -H "Accept-Encoding: gzip, deflate, br" \
  -H "DNT: 1" \
  -H "Connection: keep-alive" \
  -H "Upgrade-Insecure-Requests: 1" \
  -H "Sec-Fetch-Dest: document" \
  -H "Sec-Fetch-Mode: navigate" \
  -H "Sec-Fetch-Site: none" \
  -H "Sec-Fetch-User: ?1" \
  -H "Cache-Control: max-age=0" \
  --compressed \
  "[URL]"
```

**Header Explanation:**
- **User-Agent:** Latest Chrome on macOS (most common, least suspicious)
- **Accept headers:** Legitimate browser accept patterns
- **Sec-Fetch-* headers:** Chrome's security headers (critical for bypassing detection)
- **DNT:** Do Not Track (common privacy setting)
- **--compressed:** Handle gzip/br encoding like real browsers

**Expected Outcomes:**
- **Success:** HTML content retrieved → Convert to markdown → Skip to Step 5 (Output)
- **Failure:** Still blocked, CAPTCHA, or JavaScript required → Proceed to Step 3 (Tier 3)

**Typical Success Cases:**
- Sites with basic user-agent checking
- Sites with simple header validation
- Sites without JavaScript rendering requirements

**Typical Failure Cases:**
- Sites with CAPTCHA
- Sites requiring JavaScript execution
- Sites with advanced fingerprinting
- Sites with IP-based rate limiting

---

### Step 3: Tier 3 - Markdown Web Browser (Stealth Chrome + OCR)

**Description:** Use the Markdown Web Browser module (~/Dev/markdown_web_browser) which renders URLs through stealth Chrome with 60+ anti-detection measures, tiles the page into screenshots, runs OCR, and returns clean provenance-tagged markdown.

**Why this tier exists:** mdwb is strictly better than raw Playwright for markdown extraction because it:
- Bypasses Cloudflare and advanced bot detection via Chrome's `--headless=new` mode + comprehensive stealth JavaScript
- Handles image-heavy and visually complex pages via tiled OCR (financial dashboards, charts, tables rendered as images)
- Produces clean, structured markdown with provenance metadata
- Handles dynamic/JavaScript-heavy content natively

**Pre-check: Ensure server is running**

```bash
# Check if mdwb server is already running
if ! curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  echo "Starting Markdown Web Browser server..."
  cd ~/Dev/markdown_web_browser && uv run python scripts/run_server.py &
  # Wait for server to be ready (up to 30s)
  for i in $(seq 1 30); do
    curl -sf http://localhost:8000/health > /dev/null 2>&1 && break
    sleep 1
  done
fi
```

**Actions — Submit capture job and retrieve markdown:**

```bash
# Submit URL for capture
JOB_RESPONSE=$(curl -sf -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"[URL]\"}")

JOB_ID=$(echo "$JOB_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Poll for completion (jobs typically complete in 10-30s)
for i in $(seq 1 60); do
  STATUS=$(curl -sf "http://localhost:8000/jobs/$JOB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','PENDING'))")
  if [ "$STATUS" = "DONE" ]; then
    break
  elif [ "$STATUS" = "FAILED" ]; then
    echo "mdwb capture failed"
    break
  fi
  sleep 1
done

# Retrieve markdown result
if [ "$STATUS" = "DONE" ]; then
  MARKDOWN=$(curl -sf "http://localhost:8000/jobs/$JOB_ID/result.md")
  echo "$MARKDOWN"
fi
```

**Alternative — Use the CLI directly:**

```bash
cd ~/Dev/markdown_web_browser && uv run python -m scripts.mdwb_cli fetch "[URL]" --watch
```

Then retrieve markdown:
```bash
cd ~/Dev/markdown_web_browser && uv run python -m scripts.mdwb_cli jobs artifacts markdown [JOB_ID]
```

**Expected Outcomes:**
- **Success:** Clean markdown with provenance metadata → Skip to Step 5 (Output)
- **Failure:** Server not available, URL inaccessible even with stealth Chrome → Proceed to Step 4 (Tier 4)

**Typical Success Cases:**
- Cloudflare-protected sites (finviz.com, etc.)
- Single-page applications (SPAs) with heavy JavaScript
- Image-heavy pages (financial dashboards, charts, infographics)
- Dynamic content requiring full browser rendering
- Sites with complex DOM structures

**Typical Failure Cases:**
- Sites requiring residential IP addresses (datacenter IPs blocked)
- Sites with CAPTCHA that stealth Chrome can't bypass
- Sites requiring authenticated sessions/login
- Server not running or not installed

---

### Step 4: Tier 4 - Bright Data MCP (Professional Scraping)

**Description:** Use Bright Data MCP's professional scraping service with bot detection bypass

**Actions:**
```
Use mcp__Brightdata__scrape_as_markdown tool with:
- URL: [user-provided URL]
```

**What Bright Data Provides:**
- Residential proxy network (real IP addresses)
- Automatic CAPTCHA solving
- JavaScript rendering (headless browser)
- Anti-bot detection bypass
- Automatic retry logic
- Content extraction and markdown conversion

**Expected Outcomes:**
- **Success:** Content retrieved in markdown format → Proceed to Step 5 (Output)
- **Failure:** Extremely rare - site may be completely inaccessible or down

**Typical Success Cases:**
- Sites with CAPTCHA challenges
- Sites with advanced bot detection and fingerprinting
- Sites requiring residential IP addresses
- Sites with aggressive rate limiting
- Any site that blocked Tiers 1, 2, and 3

**Typical Failure Cases:**
- Site is completely down
- Site requires authentication (login)
- Site has legal restrictions (e.g., paywall, geographic restrictions)

---

### Step 5: Output & Verification

**Description:** Present retrieved content to user with tier information

**Actions:**
- Present content in markdown format
- Indicate which tier was successful
- Provide any warnings or notes about content quality

**Verification:**
- Content is readable and properly formatted
- Content matches expected URL
- No major sections missing

**Example Output:**
```markdown
Successfully retrieved content from [URL] using Tier [1/2/3/4]

[Content in markdown format...]
```

---

## Outputs

**Primary Output:**
- URL content in markdown format
- Includes title, headers, paragraphs, links, images (as markdown)

**Metadata:**
- Which tier was successful
- Any warnings or notes
- Execution time

**Where outputs are stored:**
- Returned directly to user in conversation
- No persistent storage (unless user requests it)

---

## Decision Logic

```
START
  ↓
Attempt Tier 1 (WebFetch)
  ↓
Success? → Yes → Return content ✓
  ↓
  No
  ↓
Attempt Tier 2 (Curl + Chrome Headers)
  ↓
Success? → Yes → Return content ✓
  ↓
  No
  ↓
Attempt Tier 3 (Markdown Web Browser)
  ├─ Check server health (localhost:8000)
  ├─ Start server if not running
  ├─ Submit capture job
  ├─ Poll for completion
  └─ Retrieve result.md
  ↓
Success? → Yes → Return content ✓
  ↓
  No
  ↓
Attempt Tier 4 (Bright Data MCP)
  ↓
Success? → Yes → Return content ✓
  ↓
  No
  ↓
Report failure + suggest alternatives
```

---

## Error Handling

**If Tier 1 Fails:**
- Log failure reason (blocked, timeout, error)
- Automatically proceed to Tier 2
- No user intervention required

**If Tier 2 Fails:**
- Log failure reason
- Automatically proceed to Tier 3
- No user intervention required

**If Tier 3 Fails:**
- Log failure reason (server down, capture failed, timeout)
- If server isn't running and can't be started, skip directly to Tier 4
- If capture job fails, proceed to Tier 4
- No user intervention required

**If Tier 4 Fails:**
- Report to user that site is inaccessible
- Suggest alternatives:
  - Check if URL is correct
  - Check if site requires authentication
  - Check if site has geographic restrictions
  - Try accessing manually in browser to verify site is up

---

## Optimization Notes

**When to Skip Tiers:**
- If user explicitly requests "use Bright Data" → Skip directly to Tier 4
- If user explicitly requests "use browser" or "use mdwb" → Skip to Tier 3
- If previous scrape of same domain failed at Tier 1 → Start at Tier 2
- If URL is known SPA or JavaScript-heavy → Consider starting at Tier 3
- If URL has Cloudflare protection → Start at Tier 3 (mdwb has stealth bypass)
- If URL is known difficult site with CAPTCHA → Consider starting at Tier 4
- If URL contains financial dashboards, charts, or image-heavy content → Start at Tier 3 (OCR capability)

**Cost Considerations:**
- Tier 1: Free (built-in)
- Tier 2: Free (built-in)
- Tier 3: Free (local server, local Chrome)
- Tier 4: Uses Bright Data credits (minimal cost per scrape)
- Always try cheaper tiers first unless user specifies otherwise

**Performance:**
- Tier 1: ~2-5 seconds
- Tier 2: ~3-7 seconds
- Tier 3: ~10-30 seconds (Chrome render + OCR)
- Tier 4: ~5-15 seconds
- Total worst-case: ~60 seconds for all four attempts

---

## Markdown Web Browser Reference

**Location:** `~/Dev/markdown_web_browser`
**Server:** `http://localhost:8000`
**CLI:** `cd ~/Dev/markdown_web_browser && uv run python -m scripts.mdwb_cli`

**Key API Endpoints:**
| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Server health check |
| `/jobs` | POST | Submit capture job (`{"url": "..."}`) |
| `/jobs/{id}` | GET | Job status and snapshot |
| `/jobs/{id}/result.md` | GET | Markdown output |
| `/jobs/{id}/manifest.json` | GET | Capture manifest with OCR metrics |
| `/jobs/{id}/links.json` | GET | Extracted links |

**CLI Quick Reference:**
```bash
# Submit + watch progress
uv run python -m scripts.mdwb_cli fetch "https://example.com" --watch

# Get markdown from completed job
uv run python -m scripts.mdwb_cli jobs artifacts markdown <JOB_ID>

# Get links from completed job
uv run python -m scripts.mdwb_cli jobs artifacts links <JOB_ID>
```

---

## Examples

**Example 1: Public Site (Tier 1 Success)**

Input: https://example.com

Process:
1. Attempt Tier 1 (WebFetch)
2. Success in 3 seconds
3. Return content

**Example 2: Cloudflare-Protected Site (Tier 3 Success)**

Input: https://finviz.com

Process:
1. Attempt Tier 1 (WebFetch) → Blocked (Cloudflare)
2. Attempt Tier 2 (Curl) → Blocked (Cloudflare JS challenge)
3. Attempt Tier 3 (Markdown Web Browser) → Success in 20 seconds
   - Stealth Chrome bypasses Cloudflare
   - OCR extracts stock tickers, prices, and percentages from chart images
   - Returns 200+ lines of structured markdown with provenance
4. Return content

**Example 3: JavaScript SPA (Tier 3 Success)**

Input: https://spa-site.com

Process:
1. Attempt Tier 1 (WebFetch) → Blocked (403)
2. Attempt Tier 2 (Curl) → Returns empty (JavaScript required)
3. Attempt Tier 3 (Markdown Web Browser) → Success in 15 seconds
   - Full Chrome rendering of JavaScript content
   - Clean markdown output
4. Return content

**Example 4: Protected Site with CAPTCHA (Tier 4 Success)**

Input: https://protected-site.com

Process:
1. Attempt Tier 1 (WebFetch) → Blocked (403)
2. Attempt Tier 2 (Curl) → Blocked (bot detection)
3. Attempt Tier 3 (Markdown Web Browser) → Blocked (CAPTCHA)
4. Attempt Tier 4 (Bright Data) → Success in 12 seconds
5. Return content

---

**Last Updated:** 2026-04-04
