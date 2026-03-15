---
name: holistics-query
description: Query Holistics datasets via the Semantic API using AMQL expressions. Use when the user asks to query, explore, or extract data from Holistics datasets, or generate SQL from a Holistics semantic layer.
---

# holistics-query – Holistics Semantic API

Query Holistics datasets programmatically using their Semantic API. The API handles joins, aggregations, relationships, and permissions — you specify dimensions and metrics, and get clean results back.

Reference link for updates:

- https://docs.holistics.io/docs/semantic-api/query-data
- AQL Cheatsheet:
  - https://docs.holistics.io/as-code/aql/aql-cheatsheet/functions
  - https://docs.holistics.io/as-code/aql/aql-cheatsheet/operators

## Authentication

Every request requires an API key in the `X-Holistics-Key` header. The user must provide their key (from **User Settings** in Holistics).

**NEVER log, echo, or expose the API key in output.** Store it in a variable and pass it directly.

```bash
# Store the key (user provides this)
HOLISTICS_API_KEY="<user-provided-key>"
```

The key is usually stored in `.env` or `.envrc`.

## Regional Base URLs

Ask the user which region they use if not obvious from context.

| Region             | Base URL                             |
| ------------------ | ------------------------------------ |
| APAC               | `https://secure.holistics.io/api/v2` |
| US                 | `https://us.holistics.io/api/v2`     |
| EU                 | `https://eu.holistics.io/api/v2`     |
| Holistics internal | `https://bi.holistics.io/api/v2`     |

Default to **holistics internal** (`bi.holistics.io`) unless the user specifies otherwise.

**For duty support or internal Holistics tasks, always use `bi.holistics.io`.**

## Finding the Dataset ID

**Option A: From a Holistics URL**

```
https://<region>.holistics.io/data_sets/12345/explore
                                       ^^^^^
                                     Dataset ID
```

**Option B: Via API**

```bash
curl -s -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
  "https://<region>.holistics.io/api/v2/data_sets"
```

**Option C: Get details of a specific dataset** (lists available dimensions and metrics):

```bash
curl -s -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
  "https://<region>.holistics.io/api/v2/data_sets/{id}"
```

Always inspect the dataset first to discover available dimensions and metrics before building queries.

## Endpoints

| Endpoint                       | Method | Description                           |
| ------------------------------ | ------ | ------------------------------------- |
| `/data_sets`                   | GET    | List available datasets               |
| `/data_sets/{id}`              | GET    | Get available dimensions and metrics  |
| `/data_sets/{id}/submit_query` | POST   | Query data and return results as JSON |
| `/data_sets/{id}/generate_sql` | POST   | Get generated SQL without executing   |

## Query Structure

Both `submit_query` and `generate_sql` accept the same request body:

```json
{
  "query": {
    "dimensions": [
      { "id": "dim1", "field": "model_name.field_name" },
      {
        "id": "dim2",
        "field": "model_name.date_field",
        "transformation": "datetrunc month"
      }
    ],
    "metrics": [{ "id": "metric1", "field": "metric_name" }],
    "filters": [
      {
        "field": "model_name.field_name",
        "operator": "operator_name",
        "values": ["..."]
      }
    ],
    "order": [
      { "id": "dim2", "order": "desc" },
      { "id": "dim1", "order": "asc" }
    ],
    "limit": 100
  }
}
```

| Field        | Type   | Required | Description                                           |
| ------------ | ------ | -------- | ----------------------------------------------------- |
| `dimensions` | array  | No       | Fields to group by (see dimension object below)       |
| `metrics`    | array  | No       | Measures to calculate (see metric object below)       |
| `filters`    | array  | No       | Conditions to filter data                             |
| `order`      | array  | No       | Sort order, referencing dimension/metric `id`s        |
| `limit`      | number | No       | Maximum rows to return                                |
| `page`       | number | No       | Page number (1-based)                                 |
| `page_size`  | number | No       | Rows per page (-1 for all)                            |
| `timezone`   | string | No       | Timezone for date operations (e.g., `Asia/Singapore`) |
| `bust_cache` | bool   | No       | Force fresh query (default: false)                    |

### Dimension object

| Field            | Required | Description                                                                                                            |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `field`          | Yes      | `model_name.field_name` (e.g., `orders.created_at`)                                                                    |
| `id`             | No       | Unique identifier, required if using `order`                                                                           |
| `transformation` | No       | Date truncation: `"datetrunc year"`, `"datetrunc quarter"`, `"datetrunc month"`, `"datetrunc week"`, `"datetrunc day"` |

### Metric object

| Field   | Required | Description                             |
| ------- | -------- | --------------------------------------- |
| `field` | Yes      | Metric name (e.g., `gmv`)               |
| `id`    | No       | Unique identifier, required for `order` |

**Field naming convention:**

- Dimensions use `model_name.field_name` (e.g., `countries.name`, `orders.created_date`)
- Metrics use just the metric name (e.g., `gmv`, `order_count`)

## Submitting a Query

`submit_query` is **asynchronous**. It returns a job ID; you poll for results.

### Step 1: Submit

```bash
curl -s -X POST \
  -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "dimensions": [
        {"id": "country", "field": "countries.name"}
      ],
      "metrics": [
        {"id": "gmv", "field": "gmv"}
      ],
      "order": [{"id": "gmv", "order": "desc"}]
    }
  }' \
  "https://<region>.holistics.io/api/v2/data_sets/{id}/submit_query"
```

Response (if not cached):

```json
{ "job": { "status": "created", "id": 12345, "existing_job_id": null } }
```

If the result is cached, the API returns data directly (same format as Step 3).

### Step 2: Poll job status

```bash
curl -s -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
  "https://<region>.holistics.io/api/v2/jobs/{job_id}"
```

Poll every 2–3 seconds until `status` is `"success"` (or `"failure"`).

### Step 3: Get results

```bash
curl -s -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
  "https://<region>.holistics.io/api/v2/jobs/{job_id}/result"
```

Response:

```json
{
  "status": "success",
  "result": {
    "data": {
      "fields": ["Country Name", "GMV"],
      "values": [
        ["United States", "1341997"],
        ["India", "1181929"]
      ],
      "meta": { "page": 1, "page_size": -1, "num_rows": 10 }
    }
  }
}
```

### Combined submit + poll + fetch script (recommended)

Complex queries can take 30–60+ seconds. **Always use a polling loop** instead of separate manual calls. This single-command pattern handles submit, polling, and result fetching:

```bash
source .envrc  # loads HOLISTICS_API_KEY

BASE_URL="https://<region>.holistics.io/api/v2"
DATASET_ID="<id>"

# Submit query
JOB_RESPONSE=$(curl -s -X POST \
  -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": { ... }}' \
  "$BASE_URL/data_sets/$DATASET_ID/submit_query")

echo "$JOB_RESPONSE"
JOB_ID=$(echo "$JOB_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['id'])")

# Poll until complete (up to ~100s)
for i in $(seq 1 20); do
  sleep 5
  STATUS=$(curl -s -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
    "$BASE_URL/jobs/$JOB_ID" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['status'])")
  echo "Poll $i: status=$STATUS"
  if [ "$STATUS" = "success" ]; then
    curl -s -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
      "$BASE_URL/jobs/$JOB_ID/result" | python3 -m json.tool
    break
  elif [ "$STATUS" = "failure" ] || [ "$STATUS" = "cancelled" ]; then
    echo "Job $STATUS"
    curl -s -H "X-Holistics-Key: $HOLISTICS_API_KEY" "$BASE_URL/jobs/$JOB_ID"
    break
  fi
done
```

**Key notes:**

- Poll every 5 seconds, up to 20 attempts (~100s max). Increase interval for very heavy queries.
- Status transitions: `created` → `running` → `success`/`failure`/`cancelled`.
- Jobs may briefly show `cancelling` before transitioning — just keep polling through it.
- If the result is cached, `submit_query` returns data directly (no job polling needed).

### generate_sql (synchronous, optional)

```bash
curl -s -X POST \
  -H "X-Holistics-Key: $HOLISTICS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": {"dimensions": [{"field": "countries.name"}], "metrics": [{"field": "gmv"}]}}' \
  "https://<region>.holistics.io/api/v2/data_sets/{id}/generate_sql"
```

Response:

```json
{
  "sql": "SELECT \"ecommerce_countries\".\"name\", SUM(...) AS \"gmv\" FROM ..."
}
```

## Filter Operators

| Operator                 | Description                      | Example value                  |
| ------------------------ | -------------------------------- | ------------------------------ |
| `is`                     | Equals any of the values         | `["USA", "UK"]`                |
| `is_not`                 | Not equal to any of the values   | `["Unknown"]`                  |
| `is_null`                | Value is null                    | `[]`                           |
| `not_null`               | Value is not null                | `[]`                           |
| `greater_than`           | Greater than                     | `[100]`                        |
| `less_than`              | Less than                        | `[1000]`                       |
| `between`                | Between two values (inclusive)   | `["2025-01-01", "2025-12-31"]` |
| `contains`               | Contains substring               | `["phone"]`                    |
| `does_not_contain`       | Does not contain substring       | `["test"]`                     |
| `starts_with`            | Starts with substring            | `["John"]`                     |
| `ends_with`              | Ends with substring              | `[".com"]`                     |
| `is_true`                | Boolean is true                  | `[]`                           |
| `is_false`               | Boolean is false                 | `[]`                           |
| `last`                   | Within last N periods            | `[7, "day"]`                   |
| `next`                   | Within next N periods            | `[30, "day"]`                  |
| `before`                 | Before a date                    | `["2025-01-01"]`               |
| `after`                  | After a date                     | `["2025-01-01"]`               |
| `matches`                | Matches regex pattern            | `["^test.*"]`                  |
| `matches_user_attribute` | Matches current user's attribute | `["department"]`               |

## Query Examples

### Basic: metric by one dimension

```json
{
  "query": {
    "dimensions": [{ "field": "countries.name" }],
    "metrics": [{ "field": "gmv" }]
  }
}
```

### Multiple dimensions and metrics

```json
{
  "query": {
    "dimensions": [
      { "field": "countries.name" },
      { "field": "products.category" }
    ],
    "metrics": [{ "field": "gmv" }, { "field": "order_count" }]
  }
}
```

### Filter by value

```json
{
  "query": {
    "dimensions": [{ "field": "countries.name" }],
    "metrics": [{ "field": "gmv" }],
    "filters": [
      {
        "field": "countries.name",
        "operator": "is",
        "value": ["United States", "United Kingdom"]
      }
    ]
  }
}
```

### Filter by date range

```json
{
  "query": {
    "dimensions": [{ "field": "orders.created_date" }],
    "metrics": [{ "field": "gmv" }],
    "filters": [
      {
        "field": "orders.created_date",
        "operator": "between",
        "value": ["2025-01-01", "2025-12-31"]
      }
    ]
  }
}
```

### Relative date filter (last 7 days)

```json
{
  "query": {
    "dimensions": [{ "field": "orders.created_date" }],
    "metrics": [{ "field": "order_count" }],
    "filters": [
      {
        "field": "orders.created_date",
        "operator": "last",
        "value": [7, "day"]
      }
    ]
  }
}
```

### Limit results (top 10)

```json
{
  "query": {
    "dimensions": [{ "field": "products.name" }],
    "metrics": [{ "field": "gmv" }],
    "limit": 10
  }
}
```

## Workflow: Query a Holistics Dataset

When the user asks to query a Holistics dataset:

1. **Get credentials:** Ask for the API key and region if not already provided. Never echo the key.
2. **Identify the dataset id:** Parse from a URL, or list datasets via `GET /data_sets`.
3. **Discover fields:** Call `GET /data_sets/{id}` to see available dimensions and metrics. Show them to the user.
4. **Build the query:** Construct the JSON body with dimensions (with `id`s), metrics, filters, order, and limit.
5. **Choose endpoint:** Use `submit_query` for data, `generate_sql` for SQL.
6. **Handle async:** If `submit_query` returns a `job` object, poll `GET /jobs/{job_id}` until status is `success`, then fetch results from `GET /jobs/{job_id}/result`.
7. **Present results:** Format `result.data.values` as a readable table using `result.data.fields` as headers.

## Workflow: Generate SQL from Semantic Layer

When the user wants to see the SQL behind a query:

1. Follow steps 1–4 from above.
2. POST to `/data_sets/{id}/generate_sql` with the query body.
3. Present the returned SQL, formatted for readability.

## Tips

- Always inspect the dataset (`GET /data_sets/{id}`) before querying to confirm valid field names.
- Dimension fields use `model_name.field_name` format; metric fields use just the metric name.
- The `value` field in filters is always an array, even for single values.
- For boolean operators (`is_true`, `is_false`, `is_null`, `not_null`), pass an empty array `[]` as the value.
- Use `generate_sql` first when debugging query issues — it shows exactly what SQL Holistics will run.
- Rate limiting applies: check `RateLimit-Remaining` response header if you hit 429 errors.
- The `last` filter operator may reject `[N, "period"]` for some period types. If it fails, use `between` with explicit ISO dates instead (e.g., `"between": ["2025-11-27", "2026-02-26"]`).

## References

- For detailed AQL function/operator syntax and examples, use [AQL cheatsheet](references/aql-cheatsheet.md).
