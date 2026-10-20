/**
 * Error types returned by the Google Play Developer Reporting API.
 * The API uses APPLICATION_NOT_RESPONDING for ANR issues even though the search filter uses ANR.
 * @see https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/ErrorType
 * @typedef {'ERROR_TYPE_UNSPECIFIED' | 'APPLICATION_NOT_RESPONDING' | 'CRASH' | 'NON_FATAL'} GooglePlayErrorType
 */

/**
 * App version metadata returned by Google Play.
 * @see https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/AppVersion
 * @typedef {Object} GooglePlayAppVersion
 * @property {string} [versionCode] App version code represented as an int64 decimal string.
 */

/**
 * Android OS version metadata returned by Google Play.
 * @see https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/OsVersion
 * @typedef {Object} GooglePlayOsVersion
 * @property {string} [apiLevel] Android API level represented as an int64 decimal string.
 */

/**
 * A decimal value represented as a string to preserve its precision.
 * @see https://developers.google.com/play/developer/reporting/reference/rest/Shared.Types/Decimal
 * @typedef {Object} GooglePlayDecimal
 * @property {string} value Decimal value.
 */

/**
 * Supplementary issue diagnosis supplied by Google Play.
 * @typedef {Object} GooglePlayIssueAnnotation
 * @property {string} category Annotation category, such as "Potential fix" or "Insight".
 * @property {string} title Annotation title.
 * @property {string} body Annotation details.
 */

/**
 * A grouped crash or ANR issue returned by Google Play.
 * Counts, affected versions, and occurrence times are scoped to the requested search interval and filters.
 * @see https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/vitals.errors.issues
 * @typedef {Object} GooglePlayErrorIssue
 * @property {string} name Stable resource name of the form apps/{app}/{issue}, subject to Google's regrouping.
 * @property {GooglePlayErrorType} [type] Grouped error type.
 * @property {string} [cause] Innermost exception, native signal, or ANR cause.
 * @property {string} [location] Likely crashing method or unresponsive activity or service.
 * @property {string} [errorReportCount] Number of error reports represented as an int64 decimal string.
 * @property {string} [distinctUsers] Estimated unique affected users represented as an int64 decimal string.
 * @property {GooglePlayDecimal} [distinctUsersPercent] Estimated percentage of affected users.
 * @property {string} lastErrorReportTime RFC 3339 timestamp at the start of the hour containing the last occurrence.
 * @property {string} [issueUri] Link to the issue in Google Play Console.
 * @property {GooglePlayOsVersion} [firstOsVersion] Smallest affected Android OS version.
 * @property {GooglePlayOsVersion} [lastOsVersion] Latest affected Android OS version.
 * @property {GooglePlayAppVersion} [firstAppVersion] Earliest affected app version.
 * @property {GooglePlayAppVersion} [lastAppVersion] Latest affected app version.
 * @property {GooglePlayIssueAnnotation[]} [annotations] Supplementary diagnostic annotations.
 * @property {string[]} [sampleErrorReports] Resource names of sample reports, not stack traces.
 */

/**
 * One page returned by vitals.errors.issues.search.
 * Google may omit the repeated errorIssues field when no issues match the query.
 * @see https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/vitals.errors.issues/search
 * @typedef {Object} GooglePlayIssueSearchResponse
 * @property {GooglePlayErrorIssue[]} [errorIssues] Grouped issues in this page.
 * @property {string} [nextPageToken] Cursor for the next page, absent at the end.
 */

/**
 * UTC ISO-8601 bounds used by the Action to serialize a Google Play search interval.
 * @typedef {Object} MonitorInterval
 * @property {string} start Inclusive start of the interval.
 * @property {string} end Exclusive end of the interval.
 */

/**
 * Complete result returned by the API client after pagination.
 * @typedef {Object} FetchedIssues
 * @property {MonitorInterval} interval Hour-aligned UTC query interval.
 * @property {GooglePlayErrorIssue[]} issues All grouped issues returned across the pages.
 */

export {};
