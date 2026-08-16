---
name: LifeOS
description: Life OS and project analysis — goals, dependencies, beliefs, wisdom, books, movies, narrative points, interview extraction, McKinsey reports, and project dashboards. USE WHEN LifeOS, life goals, projects, dependencies, books, movies, beliefs, wisdom, update LifeOS, narrative points, interview extraction, write report, McKinsey report, LifeOS report, project analysis, dashboard, n=24.
---

## 🚨 MANDATORY: Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

1. **Send voice notification**:
   ```bash
   curl -s -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running the WORKFLOWNAME workflow in the LifeOS skill to ACTION"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running the **WorkflowName** workflow in the **LifeOS** skill to ACTION...
   ```

**This is not optional. Execute this curl command immediately upon skill invocation.**

# LifeOS

**LifeOS** (Life Operating System) is a comprehensive context-gathering system with two applications:

1. **Personal LifeOS** - {PRINCIPAL.NAME}'s life context system (beliefs, goals, lessons, wisdom) at `~/.claude/AAI/USER/LifeOS/`
2. **Project LifeOS** - Analysis framework for organizations/projects (relationships, dependencies, goals, progress)


## Workflow Routing

**When executing a workflow, output this notification directly:**

```
Running the **WorkflowName** workflow in the **LifeOS** skill to ACTION...
```

| Workflow | Trigger | File |
|----------|---------|------|
| **Update** | "add to LifeOS", "update my goals", "add book to LifeOS" | `Workflows/Update.md` |
| **InterviewExtraction** | "extract content", "extract interviews", "analyze interviews" | `Workflows/InterviewExtraction.md` |
| **CreateNarrativePoints** | "create narrative", "narrative points", "LifeOS report", "n=24" | `Workflows/CreateNarrativePoints.md` |
| **WriteReport** | "write report", "McKinsey report", "create LifeOS report", "professional report" | `Workflows/WriteReport.md` |

**Note:** For general project analysis, dashboards, dependency mapping, and executive summaries, the skill handles these directly without a separate workflow file.

## Examples

**Example 1: Update personal LifeOS**
```
User: "add Project Hail Mary to my LifeOS books"
--> Invokes Update workflow
--> Creates timestamped backup of BOOKS.md
--> Adds book entry with formatted metadata
--> Logs change in updates.md with timestamp
```

**Example 2: Analyze project with LifeOS**
```
User: "analyze ~/Projects/MyApp with LifeOS"
--> Scans all .md and .csv files in directory
--> Extracts entities, relationships, dependencies
--> Returns analysis with dependency chains and progress metrics
```

**Example 3: Build project dashboard**
```
User: "build a dashboard for LifeOSAPP"
--> Launches up to 10 parallel engineers
--> Creates Next.js dashboard with shadcn/ui + Aceternity
--> Returns interactive dashboard with dependency graphs, metrics cards, progress tables
```

**Example 4: Generate narrative points**
```
User: "create LifeOS narrative for Acme Corp, n=24"
--> Invokes CreateNarrativePoints workflow
--> Analyzes LifeOS context (situation, problems, recommendations)
--> Returns 24 crisp bullet points (8-12 words each)
--> Output is slide-ready for presentations or customer briefings
```

**Example 5: Generate McKinsey-style report**
```
User: "write a LifeOS report for Acme Corp"
--> Invokes WriteReport workflow
--> First runs CreateNarrativePoints to generate story content
--> Maps narrative to McKinsey report structure
--> Generates web-based report with professional styling
--> Output at {project_dir}/report - run `bun dev` to view
--> White background, subtle Tokyo Night Storm accents
--> Includes: cover page, executive summary, findings, recommendations, roadmap
```

---

## Context Detection

**How {DAIDENTITY.NAME} determines which LifeOS context:**

| User Request | Context | Location |
|--------------|---------|----------|
| "my LifeOS", "my goals", "my beliefs", "add to LifeOS" | Personal LifeOS | `~/.claude/AAI/USER/LifeOS/` |
| "Alma", "LifeOSAPP", "analyze [project]", "dashboard for" | Project LifeOS | User-specified directory |
| "analyze ~/path/to/project" | Project LifeOS | Specified path |

---

# Part 1: Personal LifeOS ({PRINCIPAL.NAME}'s Life)

## Location

**CRITICAL PATH:** All personal LifeOS files are located at:
```
~/.claude/AAI/USER/LifeOS/
```

Personal LifeOS lives in the CORE USER directory, NOT directly under the LifeOS skill directory.

## Personal LifeOS Framework

All files located in `~/.claude/AAI/USER/LifeOS/`:

### Core Philosophy
- **LifeOS.md** - Main framework document
- **MISSION.md** - Life mission statement
- **BELIEFS.md** - Core beliefs and world model
- **WISDOM.md** - Accumulated wisdom

### Life Data
- **BOOKS.md** - Favorite books
- **MOVIES.md** - Favorite movies
- **LEARNED.md** - Lessons learned over time
- **WRONG.md** - Things {PRINCIPAL.NAME} was wrong about (growth tracking)

### Mental Models
- **FRAMES.md** - Mental frames and perspectives
- **MODELS.md** - Mental models used for decision-making
- **NARRATIVES.md** - Personal narratives and self-stories
- **STRATEGIES.md** - Strategies being employed in life

### Goals & Challenges
- **GOALS.md** - Life goals (short-term and long-term)
- **PROJECTS.md** - Active projects
- **PROBLEMS.md** - Problems to solve
- **CHALLENGES.md** - Current challenges being faced
- **PREDICTIONS.md** - Predictions about the future
- **TRAUMAS.md** - Past traumas (for context and healing)

### Change Tracking
- **updates.md** - Comprehensive changelog of all LifeOS updates

## Working with Personal LifeOS

### Read Files

```bash
# View specific file
read ~/.claude/AAI/USER/LifeOS/GOALS.md
read ~/.claude/AAI/USER/LifeOS/BELIEFS.md

# View recent updates
read ~/.claude/AAI/USER/LifeOS/updates.md
```

### Update Personal LifeOS

**CRITICAL:** Never manually edit. Use the Update workflow.

**Workflow:** `Workflows/Update.md`

The workflow provides:
- Automatic timestamped backups
- Change logging in updates.md
- Version history preservation
- Proper formatting and structure

**Valid files for updates:**
BELIEFS.md, BOOKS.md, CHALLENGES.md, FRAMES.md, GOALS.md, LEARNED.md, MISSION.md, MODELS.md, MOVIES.md, NARRATIVES.md, PREDICTIONS.md, PROBLEMS.md, PROJECTS.md, STRATEGIES.md, LifeOS.md, TRAUMAS.md, WISDOM.md, WRONG.md

---

# Part 2: Project LifeOS (Organizational Analysis)

## Capabilities

For any project directory, LifeOS provides:

1. **Relationship Discovery** - Find how files/entities connect
2. **Dependency Mapping** - Identify what depends on what
3. **Goal Extraction** - Discover stated and implied objectives
4. **Progress Analysis** - Track advancement and metrics
5. **Narrative Generation** - Create executive summaries
6. **Visual Dashboards** - Build beautiful UIs with data

## Target Directory Detection

**Flexible file discovery - no required structure:**

```bash
# User specifies directory
"Analyze ~/Cloud/Projects/LifeOSAPP"
--> {DAIDENTITY.NAME} scans for .md and .csv files anywhere in tree

# {DAIDENTITY.NAME} automatically finds all .md and .csv files regardless of structure
```

## Analysis Workflow

### Step 1: Identify Target

**Auto-detection:**
- User mentions project name (LifeOSAPP, Alma, etc.)
- User provides path explicitly
- {DAIDENTITY.NAME} looks for common project locations

### Step 2: Scan Files

Discover all markdown and CSV files:
```bash
find $TARGET_DIR -type f \( -name "*.md" -o -name "*.csv" \)
```

Index:
- Markdown structure (headings, sections, links)
- CSV schema (columns, data types)
- Cross-references and mentions
- Entities (people, teams, projects, problems)

### Step 3: Relationship Analysis

Build relationship graph:
1. **Entity Extraction** - Identify unique entities
2. **Connection Discovery** - Find explicit/implicit links
3. **Dependency Mapping** - Trace dependencies
4. **Network Construction** - Build directed graph

### Step 4: Generate Insights

Produce analytics:
- **Dependency Chains**: PROBLEMS --> GOALS --> STRATEGIES --> PROJECTS
- **Bottlenecks**: What blocks progress?
- **Goal Alignment**: Projects aligned with objectives?
- **Progress Metrics**: Completion percentages
- **Risk Areas**: Overdue items, blocked work

### Step 5: Create Outputs

**Output Formats:**

1. **Markdown Report** - Static analysis with Mermaid diagrams
2. **Web Dashboard** - Interactive app with shadcn/ui + Aceternity
3. **JSON Export** - Structured data
4. **Executive Summary** - Narrative overview
5. **Custom Format** - As requested

## Building Dashboards

### Parallel Engineer Strategy

**CRITICAL: When building UIs, use up to 16 parallel engineers.**

**Launch Strategy:**
Use single message with 10 Task calls in parallel:

```
Engineer 1: Project structure + layout + navigation
Engineer 2: Overview page with metrics cards
Engineer 3: Projects page with progress tracking
Engineer 4: Teams page with performance tables
Engineer 5: Vulnerabilities/issues page
Engineer 6: Progress timeline visualization
Engineer 7: Data parsing library (MD/CSV)
Engineer 8: Shared components (cards, badges, tables)
Engineer 9: Design polish and theme
Engineer 10: Integration and testing
```

### Dashboard Requirements

**Tech Stack:**
- Next.js 14 + TypeScript
- shadcn/ui for UI components
- Aceternity UI for layouts
- Tailwind CSS
- Tokyo Night Day theme (professional light)

**Features:**
- Dependency graphs (Mermaid or D3.js)
- Progress tables (sortable, filterable)
- Metrics cards (KPIs, stats)
- Timeline visualizations
- Relationship networks

**Design:**
```css
--background: #ffffff
--foreground: #1a1b26
--primary: #2e7de9
--accent: #9854f1
--destructive: #f52a65
--success: #33b579
--warning: #f0a020
```

## Common LifeOS Files

**Standard Project LifeOS Structure** (auto-detected):

### Context Files
- **OVERVIEW.md** - Project overview
- **COMPANY.md** - Organization context
- **PROBLEMS.md** - Issues to solve
- **GOALS.md** - Objectives
- **MISSION.md** - Mission statement
- **STRATEGIES.md** - Strategic approaches
- **PROJECTS.md** - Active initiatives

### Operational Files
- **EMPLOYEES.md** - Team members
- **ENGINEERING_TEAMS.md** - Team structure
- **BUDGET.md** - Financial tracking
- **KPI_TRACKING.md** - Metrics
- **APPLICATIONS.md** - App inventory
- **TOOLS.md** - Tooling
- **VENDORS.md** - Third parties

### Security Files
- **VULNERABILITIES.md** - Security issues
- **SECURITY_POSTURE.md** - Security state
- **THREAT_MODEL.md** - Threats

### Data Files (CSV)
- **data/VULNERABILITIES.csv** - Vuln tracking
- **data/INCIDENTS.csv** - Incident log
- **data/VENDORS.csv** - Vendor data

**Note:** Files are optional. LifeOS adapts to whatever exists.

## Visualization Types

**Available Visualizations:**

- **Dependency Graphs** - Mermaid or D3.js network
- **Progress Tables** - shadcn/ui tables with filters
- **Metrics Cards** - Aceternity card layouts
- **Timeline Charts** - Progress over time
- **Status Dashboards** - KPI overviews
- **Relationship Networks** - Force-directed graphs
- **Bar Charts** - Recharts for comparisons
- **Line Charts** - Trend analysis

---

## Security & Privacy

**Personal LifeOS:**
- NEVER commit to public repos
- NEVER share publicly
- Always backup before changes
- Use Update workflow only

**Project LifeOS:**
- May contain sensitive data
- Ask before sharing externally
- Redact sensitive info in examples
- Follow AAI security protocols

---

## Key Principles

1. **Dual Context** - Handles both personal and project LifeOS seamlessly
   - Personal LifeOS: `~/.claude/AAI/USER/LifeOS/` (in CORE USER directory)
   - Project LifeOS: User-specified directories
2. **Auto-Detection** - Determines context from user question
3. **Flexible Discovery** - Finds files regardless of structure
4. **LifeOS Methodology** - Applies relationships, dependencies, goals, narratives
5. **Parallel Execution** - Up to 10 engineers for dashboard builds
6. **Visual Excellence** - Beautiful outputs with shadcn/ui + Aceternity
7. **Privacy-Aware** - Respects sensitive data
8. **Integrated** - Works with development, research, and other skills

---

**LifeOS is {PRINCIPAL.NAME}'s life operating system AND project analysis framework. One skill, two powerful contexts.**

**Remember:** Personal LifeOS files live at `~/.claude/AAI/USER/LifeOS/` (in the CORE USER directory)
