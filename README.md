# Google Play Vitals Action

A read-only GitHub Action for collecting grouped Android crashes and ANRs from the [Google Play Developer Reporting API](https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/vitals.errors.issues/search).

The Action fetches all pages of crash/ANR clusters, writes a structured JSON report and a Markdown summary, and optionally compares them with a previous report. It does **not** schedule itself, upload artifacts, publish summaries, open GitHub issues, or send notifications.
Those are responsibilities of the calling workflow.

The runtime is Node.js 24 and has no third-party dependencies.

## Inputs and outputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `package-name` | Yes | | Android package name |
| `google-access-token` | Yes | | OAuth token with `playdeveloperreporting` scope |
| `previous-report` | No | | Path to an earlier JSON report |
| `lookback-hours` | No | `72` | UTC interval length, 1–720 hours |
| `output-directory` | No | `play-vitals` | Directory for reports |

Outputs: `report-file`, `markdown-file`, `issue-count`, `new-issues`, `resurfaced-issues`, `updated-issues`, and `has-changes`.

The JSON report is also the next run's snapshot.
The first execution is a baseline: existing crashes are reported but **not** classified as new.
Subsequent runs detect unseen clusters, clusters with newer occurrences, and previously seen clusters that return after the lookback interval.

Counts describe the **current rolling time window**, not all-time totals.
Because Google rounds occurrence times to hours, multiple events within a single hour may not produce an updated signal.
Google can also regroup existing reports under new IDs.

## Example consuming workflow

This is an example of what to place in an Android application's repository after a version of this Action has been released.
Set `PLAY_WIF_PROVIDER`, `PLAY_SERVICE_ACCOUNT`, and `PLAY_PACKAGE_NAME` as repository variables.

```yaml
name: 'Google Play Vitals'

on:
  schedule:
    - cron: '17 0 * * *'
  workflow_dispatch:

permissions:
  contents: read
  actions: read
  id-token: write

concurrency:
  group: 'google-play-vitals'
  cancel-in-progress: false

jobs:
  monitor:
    runs-on: 'ubuntu-latest'
    steps:
      - name: 'Find previous snapshot'
        id: previous
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          run_id=$(gh run list --workflow "$GITHUB_WORKFLOW" --branch "$GITHUB_REF_NAME" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty')
          if [ -n "$run_id" ] && gh run download "$run_id" --name 'play-vitals-snapshot' --dir previous; then
            echo 'path=previous/report.json' >> "$GITHUB_OUTPUT"
          fi

      - uses: google-github-actions/auth@v3
        id: auth
        with:
          workload_identity_provider: ${{ vars.PLAY_WIF_PROVIDER }}
          service_account: ${{ vars.PLAY_SERVICE_ACCOUNT }}
          token_format: 'access_token'
          access_token_scopes: 'https://www.googleapis.com/auth/playdeveloperreporting'

      - name: 'Fetch crashes and ANRs'
        id: vitals
        uses: Attacktive/google-play-vitals-action@v1
        with:
          package-name: ${{ vars.PLAY_PACKAGE_NAME }}
          google-access-token: ${{ steps.auth.outputs.access_token }}
          previous-report: ${{ steps.previous.outputs.path }}

      - name: 'Publish job summary'
        run: cat "${{ steps.vitals.outputs.markdown-file }}" >> "$GITHUB_STEP_SUMMARY"

      - uses: actions/upload-artifact@v7
        with:
          name: 'play-vitals-snapshot'
          path: ${{ steps.vitals.outputs.report-file }}
          retention-days: 90

      - name: 'React to new issues'
        if: steps.vitals.outputs.new-issues != '0'
        run: echo 'Consumer decides whether and how to file issues'
```

Use a pinned action commit SHA for production workflows after publishing a release. No `v1` tag exists until one is explicitly created.

### Google access

1. Enable the Play Developer Reporting API in Google Cloud.
2. Grant a service account **View app information (read-only)** for the app in Play Console.
3. Set up Google Cloud Workload Identity Federation for the consuming GitHub repository and service account. Restrict the trust condition to that repository.
4. Obtain a short-lived token with the `https://www.googleapis.com/auth/playdeveloperreporting` scope, as in the example.

The Action does not require a GitHub token.
It never prints access tokens or full reports to logs.
Treat generated JSON as potentially sensitive and choose artifact visibility and retention appropriately.

### Google Play API types

The JSDoc typedefs in [src/types.js](src/types.js) describe the `GooglePlayIssueSearchResponse` and its nested `GooglePlayErrorIssue`, `GooglePlayAppVersion`, `GooglePlayOsVersion`, `GooglePlayDecimal`, and `GooglePlayIssueAnnotation` values.
Google Play returns int64 counts and version codes as **strings**, and its `APPLICATION_NOT_RESPONDING` response type represents ANRs.
The `sampleErrorReports` field contains **resource names**, not stack traces.
The API client accepts a missing `errorIssues` array for an empty search result.

### Limitations

- This reports **grouped issues** (cause, location, counts, versions, Play Console links), not the entire individual stack traces.
- A previous snapshot is optional; without one every run is a baseline.
- Missing/expired snapshots cause a new baseline rather than false alerts.
- A rolling query interval cannot guarantee detecting issues after monitoring has been offline longer than its lookback.
- Google may change issue grouping, so a regrouped crash can appear as a new issue.
- API errors, invalid responses, and runaway pagination fail the Action rather than silently claiming zero crashes.

## Development

Requires Node.js 24. Run `npm test` to execute the tests with the built-in Node test runner.
