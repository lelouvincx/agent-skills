# Fixture WID-002: duplicated root cause and overlong evidence

## Summary

The dbdiagram dashboard is stale because the import job runs after the dashboard refresh. The solution is to move the import job earlier.

## Trigger

Thi reported in Slack that the dashboard sometimes does not include the latest 1 to 2 days.

## Why this matters

The dashboard should show the latest imported dbdiagram data before the business day starts. When it is stale, the team checks the wrong dashboard state.

## Current state

The dashboard refresh starts before the dbdiagram import completes. This is the root cause of the missing data.

## Evidence

Dashboard schedule:

```text
refresh_dashboard starts at 08:00
refresh_dashboard reads dbdiagram_dashboard_tables
```

Import schedule:

```text
import_dbdiagram starts at 08:30
import_dbdiagram usually finishes between 08:50 and 09:15
import_dbdiagram writes dbdiagram_dashboard_tables
```

Query used during investigation:

```sql
select
  job_name
  , scheduled_at
  , started_at
  , finished_at
from scheduler_runs
where job_name in ('refresh_dashboard', 'import_dbdiagram')
order by scheduled_at desc
```

The evidence confirms that the late import job is the root cause.

## Analysis

The root cause is that the dbdiagram import starts after the dashboard refresh. Because the import is late, the dashboard reads yesterday's imported tables.

## Decision

Move the dbdiagram import earlier. This fixes the root cause because the dashboard will read the latest imported tables after the schedule change.

## Schedule change

Move `import_dbdiagram` to 07:30 so it finishes before the dashboard refresh starts at 08:00.

## Validation

Check tomorrow's dashboard run and confirm the latest 1 to 2 days appear.
