#!/bin/bash
set -e

# BigQuery query wrapper (modeled after redshift-query.sh)
# Usage: bigquery-query.sh [-p project] [-d dataset] [-l location] [-m max-rows] [-f format] "SQL"

PROJECT="${BIGQUERY_PROJECT:-}"
DATASET="${BIGQUERY_DATASET:-}"
LOCATION="${BIGQUERY_LOCATION:-}"
MAX_ROWS=100
OUTPUT_FORMAT="markdown"  # markdown, json, csv
DRY_RUN=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [options] "SQL query"

Options:
    -p PROJECT    GCP project ID (or set BIGQUERY_PROJECT)
    -d DATASET    Default dataset (or set BIGQUERY_DATASET)
    -l LOCATION   Processing location, e.g. US, EU (or set BIGQUERY_LOCATION)
    -m MAX_ROWS   Maximum rows to return (default: 100)
    -f FORMAT     Output format: markdown (default), json, csv
    -n            Dry run — estimate bytes processed without executing
    -h            Show this help

Examples:
    $(basename "$0") -p my-project "SELECT * FROM dataset.table LIMIT 10"
    $(basename "$0") -p my-project -d my_dataset -f csv "SELECT count(*) FROM orders"
    $(basename "$0") -n -p my-project "SELECT * FROM dataset.large_table"
EOF
    exit 1
}

while getopts "p:d:l:m:f:nh" opt; do
    case $opt in
        p) PROJECT="$OPTARG" ;;
        d) DATASET="$OPTARG" ;;
        l) LOCATION="$OPTARG" ;;
        m) MAX_ROWS="$OPTARG" ;;
        f) OUTPUT_FORMAT="$OPTARG" ;;
        n) DRY_RUN=true ;;
        h) usage ;;
        *) usage ;;
    esac
done
shift $((OPTIND - 1))

QUERY="$1"
[[ -z "$QUERY" ]] && { echo "Error: SQL query required"; usage; }

command -v bq >/dev/null 2>&1 || { echo "Error: bq CLI is required (install via gcloud SDK)"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq is required"; exit 1; }

# Build bq args
BQ_ARGS=(query --use_legacy_sql=false --format=json --max_rows="$MAX_ROWS")

if [[ -n "$PROJECT" ]]; then
    BQ_ARGS+=(--project_id="$PROJECT")
fi

if [[ -n "$DATASET" ]]; then
    BQ_ARGS+=(--dataset_id="$DATASET")
fi

if [[ -n "$LOCATION" ]]; then
    BQ_ARGS+=(--location="$LOCATION")
fi

if [[ "$DRY_RUN" == true ]]; then
    BQ_ARGS+=(--dry_run)
    echo "Dry run — estimating bytes processed..." >&2
    bq "${BQ_ARGS[@]}" "$QUERY"
    exit 0
fi

echo "Submitting query to BigQuery..." >&2

# Execute query and capture JSON output
RAW_RESULT=$(bq "${BQ_ARGS[@]}" "$QUERY" 2>&1)
BQ_EXIT=$?

if [[ $BQ_EXIT -ne 0 ]]; then
    echo "Query failed:" >&2
    echo "$RAW_RESULT" >&2
    exit 1
fi

# Handle empty results
if [[ -z "$RAW_RESULT" || "$RAW_RESULT" == "[]" ]]; then
    echo "Query returned no results." >&2
    exit 0
fi

echo "Query finished!" >&2

format_markdown() {
    local json="$1"

    # Extract column names from first row
    local cols
    cols=$(echo "$json" | jq -r '.[0] | keys_unsorted | .[]')
    local col_count
    col_count=$(echo "$json" | jq '.[0] | keys_unsorted | length')

    # Header
    header="| "
    separator="| "
    for name in $cols; do
        header+="$name | "
        separator+="--- | "
    done
    echo "$header"
    echo "$separator"

    # Rows
    echo "$json" | jq -c '.[]' | while IFS= read -r row; do
        line="| "
        for name in $cols; do
            val=$(echo "$row" | jq -r --arg k "$name" '.[$k] // ""')
            line+="$val | "
        done
        echo "$line"
    done
}

format_csv() {
    local json="$1"

    # Header
    echo "$json" | jq -r '.[0] | keys_unsorted | @csv'

    # Rows
    echo "$json" | jq -r '.[] | [.[]] | @csv'
}

format_json() {
    local json="$1"
    echo "$json" | jq '.'
}

case "$OUTPUT_FORMAT" in
    markdown|md)
        format_markdown "$RAW_RESULT"
        ;;
    csv)
        format_csv "$RAW_RESULT"
        ;;
    json)
        format_json "$RAW_RESULT"
        ;;
    *)
        echo "Unknown format: $OUTPUT_FORMAT" >&2
        exit 1
        ;;
esac
