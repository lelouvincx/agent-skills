---
name: bigquery-query
description: Queries BigQuery with the bq CLI. Use for BigQuery queries, exploration, extraction, or Holistics dbt-to-prod table lookup.
---

# bigquery-query - Google BigQuery CLI

Query BigQuery datasets using the `bq` CLI (part of Google Cloud SDK). Always use `--use_legacy_sql=false` for standard SQL.

## Prerequisites

- **Google Cloud SDK** installed with `bq` CLI available
- **Authentication** configured via `gcloud auth login` or a service account

## Projects

| Environment | Project ID              |
| ----------- | ----------------------- |
| Production  | `skilled-fulcrum-90207` |
| Development | `holistics-data-294707` |

Prefer explicit `--project_id=...` on every command instead of changing global gcloud config.
Check active project only when debugging auth/project confusion:

```bash
gcloud config get-value project
```

## Workflow

1. **Pick project:** Use explicit `--project_id=skilled-fulcrum-90207` or `--project_id=holistics-data-294707`.
2. **Resolve names:** If the user gives a dbt model/source name, map it to the physical BigQuery relation before querying.
3. **Discover:** List datasets and tables, inspect schemas before writing queries.
4. **Query:** Run the query.

## Holistics dbt Model Lookup

When working in `/Users/lelouvincx/Developer/holistics/data/dbt`, do **not** guess BigQuery table names from dbt model names. This project customizes schemas and many model aliases.

Authoritative rule: parse dbt for the `prod` target and use `relation_name` from `manifest.json`.

```bash
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

uv run dbt parse \
  --profiles-dir dbt_profiles \
  --target prod \
  --target-path "$tmpdir/target" \
  --log-path "$tmpdir/logs" \
  --no-partial-parse \
  --quiet

MODEL=mart_core_business__daily_mrr

jq -r --arg model "$MODEL" '
  .nodes["model.internal_analytics." + $model]
  | {
      materialized: .config.materialized,
      relation_name,
      path: .original_file_path
    }
' "$tmpdir/target/manifest.json"
```

Use the returned `relation_name` as the BigQuery table. If `relation_name` is null or `materialized` is `ephemeral`, there is no physical BigQuery table to query.

### Source Lookup

For dbt sources, resolve `source(source_name, table_name)` through `.sources[]`:

```bash
SOURCE=src_holistics_sg
TABLE=users

jq -r --arg source "$SOURCE" --arg table "$TABLE" '
  .sources["source.internal_analytics." + $source + "." + $table]
  | {
      relation_name,
      identifier,
      path: .original_file_path
    }
' "$tmpdir/target/manifest.json"
```

### Common Prod Mapping Rules

- Prod project: `skilled-fulcrum-90207`.
- Prod schemas use dbt configured schemas exactly; dev adds `dev_`.
- `models/mart/core_business`, `growth`, `product`, `event`, `marketing`, and `customer_support` usually map to `mart_holistics`, not per-folder datasets.
- `models/mart/internal`, `engineer`, and `hiring` map to `mart_internal`; `models/mart/utils` maps to `mart_utility`.
- Staging exceptions: `holistics` -> `dbt_staging`; `dbdiagram`/`dbdocs`/`runsql`/`chargebee` -> `staging_dbx`; `google` -> `stg_google`.
- Table name is `config(alias = "...")` if present; otherwise the model/file name.
- `ephemeral` models have no BigQuery table.

Example: `mart_core_business__daily_mrr` maps to `` `skilled-fulcrum-90207`.`mart_holistics`.`fct_daily_mrr` `` because the model sets `alias = 'fct_daily_mrr'`.

Use BigQuery metadata only as a sanity check after dbt lookup. The active `gcloud` account may not have visibility into all prod datasets; dbt prod metadata and the prod profile service account are more authoritative for this project. Do not print or expose service account key contents.

## Core Commands

### Run a Query

```bash
bq query --use_legacy_sql=false --project_id=PROJECT_ID \
  "select * from dataset.table limit 10"
```

### Dry Run (Cost Estimation)

Always run a dry run first on large or unfamiliar tables to check bytes processed:

```bash
bq query --use_legacy_sql=false --dry_run --project_id=PROJECT_ID \
  "select * from dataset.table"
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

## Tips

- **Use explicit projects:** prefer `--project_id=...`; check active project only when debugging auth/project confusion.
- **Always filter on partition columns** to avoid full table scans and reduce costs.
- **Use `--dry_run`** before running queries on large tables to check estimated bytes.
- **Use `limit 10`** during exploration; remove it only for final queries.
- **Fully qualify table names** as `project.dataset.table` to avoid ambiguity.
- **Use `safe_` prefix functions** (e.g., `safe_divide`, `safe_cast`) to avoid query failures on bad data.
- BigQuery charges by bytes scanned; `select *` on wide tables is expensive. Select only needed columns.
- Use `bq show --format=json` to inspect table schemas before writing queries.
