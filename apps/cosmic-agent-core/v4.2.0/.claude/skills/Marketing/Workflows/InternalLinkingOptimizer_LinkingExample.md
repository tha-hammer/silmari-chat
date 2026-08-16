# InternalLinkingOptimizer — Worked Example

Referenced from [InternalLinkingOptimizer.md](./InternalLinkingOptimizer.md).

---

## Worked Example

**User**: "Find internal linking opportunities for our article about PostgreSQL index performance monitoring"

**Output**:

```markdown
## Internal Linking Opportunities

**Page**: https://www.example.com/learn/how-to-monitor-and-optimize-postgresql-index-performance
**Current Internal Links**: 2
**Verified URL inventory**: 47 URLs from user-provided list + sitemap

### Recommended Links to Add

| Section | Text to Link | Target Page | Anchor |
|---------|--------------|-------------|--------|
| Para 2 | "query performance" | https://www.example.com/learn/postgresql-query-optimization-guide | "PostgreSQL query optimization" |
| Para 5 | "database indexes" | https://www.example.com/learn/postgresql-performance-tuning-optimizing-database-indexes | "optimizing database indexes" |
| Section on monitoring | "continuous aggregates" | https://www.example.com/docs/use-timescale/continuous-aggregates | "continuous aggregates" |
| CTA section | "time-series data" | https://www.example.com/learn/what-is-a-time-series-database | "time-series database" |
| Conclusion | "managed cloud" | https://www.example.com/cloud | "managed PostgreSQL in the cloud" |

### Pages That Should Link TO This Article

| Source Page | Location | Anchor Text |
|-------------|----------|-------------|
| https://www.example.com/learn/postgresql-performance-tuning-optimizing-database-indexes | Index monitoring section | "monitor and optimize index performance" |
| https://www.example.com/blog/postgresql-tips-for-better-performance | Related reading | "PostgreSQL index monitoring best practices" |
| https://www.example.com/learn/postgresql-query-optimization-guide | Index section | "index performance monitoring techniques" |

### Priority Actions

1. Add 5 outbound internal links (listed above — all verified against the user-provided list + sitemap)
2. Request 3 inbound links from related pages
3. Verify all links resolve correctly before publishing
```
