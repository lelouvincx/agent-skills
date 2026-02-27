---
name: bigquery-query
description: Query Google BigQuery datasets using the bq CLI. Use when the user asks to query, explore, or extract data from BigQuery, or run SQL against Google Cloud data warehouse.
---

# bigquery-query – Google BigQuery CLI

Query BigQuery datasets using the `bq` CLI (part of Google Cloud SDK). Supports standard SQL, dry runs for cost estimation, and multiple output formats.

This skill includes a wrapper script modeled after [`redshift-query.sh`](file:///Users/lelouvincx/.local/bin/redshift-query.sh) that handles query execution and output formatting.

## Prerequisites

- **Google Cloud SDK** installed with `bq` CLI available
- **Authentication** configured via `gcloud auth login` or a service account
- **jq** installed for JSON processing

## Quick Start

Run `scripts/bigquery-query.sh` to execute queries:

```bash
scripts/bigquery-query.sh -p my-project "SELECT * FROM dataset.table LIMIT 10"
```

### Script Options

| Flag | Description | Env Variable |
| ---- | ----------- | ------------ |
| `-p` | GCP project ID | `BIGQUERY_PROJECT` |
| `-d` | Default dataset | `BIGQUERY_DATASET` |
| `-l` | Processing location (US, EU, etc.) | `BIGQUERY_LOCATION` |
| `-m` | Max rows to return (default: 100) | — |
| `-f` | Output format: `markdown`, `json`, `csv` | — |
| `-n` | Dry run — estimate bytes without executing | — |

### Examples

```bash
# Basic query
scripts/bigquery-query.sh -p my-project "SELECT count(*) as cnt FROM my_dataset.orders"

# CSV output
scripts/bigquery-query.sh -p my-project -f csv "SELECT * FROM my_dataset.users LIMIT 50"

# Dry run to estimate cost
scripts/bigquery-query.sh -n -p my-project "SELECT * FROM my_dataset.large_table"

# Using environment variables
export BIGQUERY_PROJECT="my-project"
export BIGQUERY_DATASET="my_dataset"
scripts/bigquery-query.sh "SELECT count(*) FROM orders"
```

## Using bq CLI Directly

For more control, use `bq` directly. Always use `--use_legacy_sql=false` for standard SQL.

### Run a Query

```bash
bq query --use_legacy_sql=false --project_id=PROJECT_ID \
  "SELECT * FROM dataset.table LIMIT 10"
```

### Dry Run (Cost Estimation)

Always run a dry run first on large or unfamiliar tables to check bytes processed:

```bash
bq query --use_legacy_sql=false --dry_run --project_id=PROJECT_ID \
  "SELECT * FROM dataset.table"
```

### List Datasets

```bash
bq ls --project_id=PROJECT_ID
```

### List Tables in a Dataset

```bash
bq ls --project_id=PROJECT_ID dataset_name
```

### Get Table Schema

```bash
bq show --format=json PROJECT_ID:dataset.table | jq '.schema.fields'
```

### Get Table Info (Row Count, Size)

```bash
bq show --format=json PROJECT_ID:dataset.table | jq '{rows: .numRows, bytes: .numBytes, type: .type}'
```

## Workflow

1. **Discover** — List datasets and tables, inspect schemas before writing queries.
2. **Estimate** — Use `--dry_run` or the `-n` flag to check bytes processed.
3. **Query** — Run the query with appropriate `LIMIT` for exploration.
4. **Format** — Use `-f` to choose output format (`markdown` for display, `csv` for export, `json` for processing).

## BigQuery Standard SQL Reference

### Common Patterns

```sql
-- Aggregation with GROUP BY
SELECT date, COUNT(*) as cnt, SUM(amount) as total
FROM `project.dataset.orders`
WHERE created_at >= '2025-01-01'
GROUP BY date
ORDER BY date DESC;

-- STRUCT and ARRAY access
SELECT
  user.name,
  user.address.city,
  ARRAY_LENGTH(user.orders) as order_count
FROM `project.dataset.users`;

-- Partitioned table filter (always filter on partition column for cost savings)
SELECT *
FROM `project.dataset.events`
WHERE _PARTITIONDATE BETWEEN '2025-01-01' AND '2025-01-31';

-- UNNEST arrays
SELECT user_id, order_id
FROM `project.dataset.users`,
UNNEST(order_ids) AS order_id;

-- CTEs
WITH monthly AS (
  SELECT DATE_TRUNC(created_at, MONTH) as month, SUM(amount) as total
  FROM `project.dataset.orders`
  GROUP BY 1
)
SELECT * FROM monthly ORDER BY month;
```

### Useful Functions

| Function | Description |
| -------- | ----------- |
| `DATE_TRUNC(date, MONTH)` | Truncate date to month/week/year |
| `TIMESTAMP_DIFF(a, b, DAY)` | Difference between timestamps |
| `FORMAT_TIMESTAMP('%Y-%m-%d', ts)` | Format timestamp |
| `PARSE_DATE('%Y%m%d', str)` | Parse string to date |
| `SAFE_DIVIDE(a, b)` | Returns NULL instead of error on divide-by-zero |
| `IFNULL(expr, default)` | Replace NULL with default |
| `COALESCE(a, b, c)` | First non-null value |
| `ARRAY_AGG(expr)` | Aggregate into array |
| `STRING_AGG(expr, ',')` | Concatenate strings |
| `APPROX_COUNT_DISTINCT(expr)` | Fast approximate distinct count |
| `GENERATE_DATE_ARRAY(start, end, INTERVAL 1 DAY)` | Date range array |

## Projects

| Environment | Project ID |
| ----------- | ---------- |
| Production  | `skilled-fulcrum-90207` |
| Development | `holistics-data-294707` |

**Before running any query**, check the current active project to avoid querying the wrong environment:

```bash
gcloud config get-value project
```

Switch project if needed:

```bash
gcloud config set project skilled-fulcrum-90207   # production
gcloud config set project holistics-data-294707   # development
```

## Tips

- **Check your active project first** — run `gcloud config get-value project` before querying to confirm you're targeting the right environment.
- **Always filter on partition columns** to avoid full table scans and reduce costs.
- **Use `--dry_run`** before running queries on large tables to check estimated bytes.
- **Use `LIMIT`** during exploration; remove it only for final queries.
- **Fully qualify table names** as `project.dataset.table` to avoid ambiguity.
- **Use `SAFE_` prefix functions** (e.g., `SAFE_DIVIDE`, `SAFE_CAST`) to avoid query failures on bad data.
- BigQuery charges by bytes scanned; `SELECT *` on wide tables is expensive. Select only needed columns.
- Use `bq show --format=json` to inspect table schemas before writing queries.
