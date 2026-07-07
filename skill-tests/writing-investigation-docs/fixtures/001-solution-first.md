# Fixture WID-001: solution-first investigation note

## Summary

The dashboard misses recent data because the import job runs too late. We should move the import job to 9am.

## Fix

Move the schedule earlier so the dashboard has fresh data.

## Background

Thi reported in Slack that the dashboard sometimes misses the latest 1 to 2 days of data.

## Current state

The dashboard refreshes before the dbdiagram import has finished.

## Evidence

The dashboard refresh starts at 8am.

The dbdiagram import starts at 8.30am and can finish after 9am.

The dashboard reads from the imported dbdiagram tables.

## Analysis

The root cause is the late dbdiagram import schedule.

## Decision

Move the dbdiagram import earlier because the root cause is the late import schedule.

## Validation

Check the dashboard after the next run.
