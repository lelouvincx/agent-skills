---
name: holistics-query
description: Query Holistics datasets via the Semantic API using AMQL expressions. Use when the user asks to query, explore, or extract data from Holistics datasets, or generate SQL from a Holistics semantic layer.
---

# holistics-query – Holistics Semantic API

Query Holistics datasets programmatically using their Semantic API. The API handles joins, aggregations, relationships, and permissions — you specify dimensions and metrics, and get clean results back.

## Authentication

Every request requires an API key in the `X-Holistics-Key` header. The user must provide their key (from **User Settings** in Holistics).

**NEVER log, echo, or expose the API key in output.** Store it in a variable and pass it directly.

```bash
# Store the key (user provides this)
HOLISTICS_API_KEY="<user-provided-key>"
```

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

### generate_sql (synchronous)

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
2. **Identify the dataset:** Parse from a URL, or list datasets via `GET /data_sets`.
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

---

## AQL Cheatsheet

AQL (Analytics Querying Language) is the query language within AMQL. It uses a pipe-based syntax centered around metrics and dimensions. Use this reference when writing AQL expressions in Holistics models, metrics, or explorations.

### Syntax Basics

- **Pipe operator `|`**: Chains operations — `orders | count(orders.id)`
- **Field references**: `model_name.field_name` — `orders.created_at`, `products.name`
- **Named parameters**: `key: value` — `sep: ', '`, `order: 'asc'`
- **Labeled fields**: `label: expression` — `total: sum(orders.value)`
- **Comments**: `// comment`
- **Datetime literals**: `@2022`, `@2022-01-01`, `@(last 7 days)`, `@(yesterday)`, `@now`
- **Intervals**: `interval(3 months)`, `interval(-1 month)`, `interval(7 days)`
- **Ranges**: `..0` (up to current), `-2..2` (sliding window), `..` (all rows)

### Aggregate Functions

| Function                | Syntax                                                                | Description                      |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------- |
| `count`                 | `count([table,] expr)`                                                | Count non-NULL values            |
| `count_if`              | `count_if([table,] condition)`                                        | Count rows matching condition    |
| `count_distinct`        | `count_distinct([table,] expr)`                                       | Count distinct non-NULL values   |
| `approx_count_distinct` | `approx_count_distinct([table,] expr)`                                | Approximate distinct count (HLL) |
| `sum`                   | `sum([table,] expr)`                                                  | Sum of values                    |
| `average` / `avg`       | `average([table,] expr)`                                              | Average of values                |
| `min`                   | `min([table,] expr)`                                                  | Minimum value                    |
| `max`                   | `max([table,] expr)`                                                  | Maximum value                    |
| `median`                | `median([table,] expr)`                                               | Median value                     |
| `stdev`                 | `stdev([table,] expr)`                                                | Sample standard deviation        |
| `stdevp`                | `stdevp([table,] expr)`                                               | Population standard deviation    |
| `var`                   | `var([table,] expr)`                                                  | Sample variance                  |
| `varp`                  | `varp([table,] expr)`                                                 | Population variance              |
| `string_agg`            | `string_agg([table,] expr, sep: ', ', distinct: false, order: 'asc')` | Concatenate values               |
| `corr`                  | `corr(table, field1, field2)`                                         | Pearson correlation coefficient  |
| `max_by`                | `max_by(table, value, by)`                                            | Value from row where `by` is max |
| `min_by`                | `min_by(table, value, by)`                                            | Value from row where `by` is min |
| `percentile_cont`       | `percentile_cont([table,] expr, 0.7)`                                 | Continuous percentile            |
| `percentile_disc`       | `percentile_disc([table,] expr, 0.7)`                                 | Discrete percentile              |

**Examples:**

```
orders | count(orders.id)
orders | count_if(orders.status == 'shipped')
orders | group(orders.delivery_country)
       | select(orders.delivery_country, total: count(orders.id))
```

### Table Functions

| Function | Syntax                                 | Description                                              |
| -------- | -------------------------------------- | -------------------------------------------------------- |
| `select` | `table \| select(field1, field2, ...)` | Pick or create columns                                   |
| `group`  | `table \| group(dim1, dim2, ...)`      | Group by dimensions (follow with `select` or `filter`)   |
| `filter` | `table \| filter(condition)`           | Filter rows locally (post-calculation)                   |
| `unique` | `unique(dim1, dim2, ...)`              | Distinct dimension combinations (for nested aggregation) |
| `top`    | `top(n, dim, by: metric)`              | Top N by metric                                          |
| `bottom` | `bottom(n, dim, by: metric)`           | Bottom N by metric                                       |

**Examples:**

```
users | select(users.id, users.email)
users | select(full_name: concat(users.first_name, " ", users.last_name))
users | group(users.country) | filter(count(users.id) > 1000)
unique(users.id) | select(total_order_value) | average()
top(5, users.name, by: count(orders.id))
```

### Condition Functions

| Function | Syntax                                   | Description                                     |
| -------- | ---------------------------------------- | ----------------------------------------------- |
| `where`  | `metric \| where(condition)`             | Filter metric at source (like dashboard filter) |
| `case`   | `case(when: cond, then: val, else: val)` | Conditional value                               |
| `and`    | `and(cond1, cond2, ...)`                 | All conditions true                             |
| `or`     | `or(cond1, cond2, ...)`                  | Any condition true                              |
| `not`    | `not(condition)`                         | Negate condition                                |

**`where` vs `filter`**: `where` pushes conditions to the source model before calculation. `filter` evaluates locally after data retrieval.

**Examples:**

```
total_order_value | where(orders.status == 'completed')
sum(orders.value) | where(orders.created_at matches @(last 30 days))
case(when: users.gender == 'm', then: 'male', when: users.gender == 'f', then: 'female', else: 'others')
```

### Level of Detail Functions

| Function               | Syntax                           | Description                                                       |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `of_all` / `exclude`   | `metric \| of_all(dim)`          | Remove dimensions from calculation context                        |
| `keep_grains` / `keep` | `metric \| keep_grains(dim)`     | Calculate only against specified dimensions                       |
| `dimensionalize`       | `metric \| dimensionalize(dim)`  | Evaluate metric at fixed grain as dimension value                 |
| `percent_of_total`     | `percent_of_total(metric, type)` | Percentage of `'grand_total'`, `'row_total'`, or `'column_total'` |

**Examples:**

```
// Percent of total
order_value / (order_value | of_all(order_items.country))

// Customer lifetime value as dimension
sum(orders.amount) | dimensionalize(users.id)

percent_of_total(sum(orders.revenue), 'grand_total')
```

### Time-based Functions

| Function          | Syntax                                               | Description                      |
| ----------------- | ---------------------------------------------------- | -------------------------------- |
| `running_total`   | `metric \| running_total(dim)`                       | Cumulative total along dimension |
| `period_to_date`  | `metric \| period_to_date('year', dim)`              | YTD/QTD/MTD calculation          |
| `exact_period`    | `metric \| exact_period(dim, @range)`                | Metric in a fixed time range     |
| `relative_period` | `metric \| relative_period(dim, interval(-1 month))` | Metric shifted by interval       |
| `trailing_period` | `metric \| trailing_period(dim, interval(3 months))` | Trailing N periods               |

**Examples:**

```
count(orders.id) | period_to_date('year', orders.created_at)
orders.total_orders | relative_period(orders.created_at, interval(-1 month))
count(orders.id) | trailing_period(orders.created_at, interval(3 months))
```

### Time Intelligence Functions

| Function        | Pipe Syntax                    | Description                |
| --------------- | ------------------------------ | -------------------------- |
| `day()`         | `dim \| day()`                 | Truncate to day            |
| `week()`        | `dim \| week()`                | Truncate to week           |
| `month()`       | `dim \| month()`               | Truncate to month          |
| `quarter()`     | `dim \| quarter()`             | Truncate to quarter        |
| `year()`        | `dim \| year()`                | Truncate to year           |
| `hour()`        | `dim \| hour()`                | Truncate to hour           |
| `minute()`      | `dim \| minute()`              | Truncate to minute         |
| `date_trunc`    | `date_trunc(dim, 'month')`     | Truncate to part           |
| `date_part`     | `date_part('year', datetime)`  | Extract numeric part       |
| `date_diff`     | `date_diff('day', start, end)` | Difference between dates   |
| `date_format`   | `date_format(dim, '%Y-%m-%d')` | Format date as string      |
| `epoch`         | `epoch(datetime)`              | Unix timestamp             |
| `from_unixtime` | `from_unixtime(number)`        | Unix timestamp to datetime |
| `last_day`      | `last_day(dim, 'month')`       | Last day of period         |
| `age`           | `dim \| age()`                 | Age in years               |

Numeric extractors: `year_num()`, `quarter_num()`, `month_num()`, `week_num()`, `day_num()`, `dow_num()`, `hour_num()`, `minute_num()`, `second_num()`

**Date format patterns:** `%Y` (4-digit year), `%m` (month), `%d` (day), `%H` (24h hour), `%M` (minute), `%S` (second), `%B` (month name), `%A` (weekday name), `%p` (AM/PM)

### Window Functions

| Function       | Syntax                                   | Description             |
| -------------- | ---------------------------------------- | ----------------------- |
| `rank`         | `rank(order: expr \| desc())`            | Rank (skip ties: 1,1,3) |
| `dense_rank`   | `dense_rank(order: expr \| desc())`      | Dense rank (1,1,2)      |
| `percent_rank` | `percent_rank(order: expr)`              | Percentile rank (0–1)   |
| `ntile`        | `ntile(4, order: expr)`                  | Divide into N buckets   |
| `next`         | `next(expr, order: expr)`                | Value from next row     |
| `previous`     | `previous(expr, order: expr)`            | Value from previous row |
| `first_value`  | `first_value(expr, order: expr)`         | First value in window   |
| `last_value`   | `last_value(expr, order: expr)`          | Last value in window    |
| `nth_value`    | `nth_value(expr, n, order: expr)`        | Nth value in window     |
| `window_sum`   | `window_sum(expr, range, order: expr)`   | Sum over window         |
| `window_avg`   | `window_avg(expr, range, order: expr)`   | Average over window     |
| `window_count` | `window_count(expr, range, order: expr)` | Count over window       |
| `window_min`   | `window_min(expr, range, order: expr)`   | Min over window         |
| `window_max`   | `window_max(expr, range, order: expr)`   | Max over window         |

All window functions accept `partition: expr` for partitioning. Axis references: `'rows'`, `'x_axis'`, `'columns'`, `'legend'`.

### Null/Zero Handling

| Function      | Syntax                      | Description            |
| ------------- | --------------------------- | ---------------------- |
| `coalesce`    | `coalesce(val1, val2, ...)` | First non-null value   |
| `nullif`      | `nullif(val1, val2)`        | NULL if equal          |
| `safe_divide` | `safe_divide(a, b)`         | NULL on divide-by-zero |

### Math Functions

`abs`, `sqrt`, `ceil`, `floor`, `round(n, scale)`, `trunc(n, scale)`, `exp`, `ln`, `log10`, `log2`, `pow(base, exp)`, `mod(a, b)`, `div(a, b)`, `sign`, `pi()`, `sin`, `cos`, `tan`, `cot`, `asin`, `acos`, `atan`, `atan2(y, x)`, `radians`, `degrees`

### String Functions

`concat(...)`, `find(text, sub)`, `left(text, n)`, `right(text, n)`, `mid(text, start, len)`, `len(text)`, `lower(text)`, `upper(text)`, `trim(text)`, `ltrim(text)`, `rtrim(text)`, `lpad(text, len, pad)`, `rpad(text, len, pad)`, `replace(text, old, new)`, `split_part(text, delim, n)`, `regexp_extract(text, regex)`, `regexp_like(text, regex)`, `regexp_replace(text, regex, sub)`, `cast(expr, type)`

### SQL Passthrough Functions

When native AQL doesn't cover a database function, use passthrough:

| Function                                | Return Type          |
| --------------------------------------- | -------------------- |
| `sql_text('FN', params...)`             | Text                 |
| `sql_number('FN', params...)`           | Number               |
| `sql_datetime('FN', params...)`         | Datetime             |
| `sql_date('FN', params...)`             | Date                 |
| `sql_truefalse('FN', params...)`        | Boolean              |
| `agg_text(table, 'FN', params...)`      | Text (aggregate)     |
| `agg_number(table, 'FN', params...)`    | Number (aggregate)   |
| `agg_datetime(table, 'FN', params...)`  | Datetime (aggregate) |
| `agg_date(table, 'FN', params...)`      | Date (aggregate)     |
| `agg_truefalse(table, 'FN', params...)` | Boolean (aggregate)  |

**Example:** `sql_text('UPPER', users.name)` — calls native SQL `UPPER()`.

### AI Functions (Databricks/Snowflake only)

| Function        | Syntax                               | Description               |
| --------------- | ------------------------------------ | ------------------------- |
| `ai_complete`   | `ai_complete(model, prompt)`         | Query AI model            |
| `ai_similarity` | `ai_similarity(text1, text2)`        | Semantic similarity (0–1) |
| `ai_classify`   | `ai_classify(text, cat1, cat2, ...)` | Classify into categories  |
| `ai_summarize`  | `ai_summarize(content)`              | Summarize text            |

### Operators Quick Reference

**Text:** `==`, `!=`, `is`, `is not`, `like`, `not like`, `ilike`, `not ilike`, `is null`, `is not null`

**List:** `in [...]`, `not in [...]`

**Number:** `==`, `!=`, `>`, `>=`, `<`, `<=`, `+`, `-`, `*`, `/`, `is null`, `is not null`

**Boolean:** `is true`, `is not true`, `is null`, `is not null`

**Datetime:** `==`, `!=`, `<`, `<=`, `>`, `>=`, `is @range`, `is not @range`, `matches @range`, `+/- interval(...)`, `is null`, `is not null`

**Datetime literal examples:**

```
orders.created_at is @2022                    // year 2022
orders.created_at matches @(last 7 days)      // relative
orders.created_at < @2022                     // before 2022
orders.created_at > @(yesterday)              // after yesterday
orders.created_at + interval(3 months)        // date arithmetic
```
