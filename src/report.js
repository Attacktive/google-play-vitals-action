const SCHEMA_VERSION = 1;

/**
 * Convert an API issue to stable, JSON-safe diagnostic data.
 * @param {import('./types.js').GooglePlayErrorIssue} issue
 */
function normalizeIssue(issue) {
	if (typeof issue.name !== 'string' || !issue.name || !Number.isFinite(Date.parse(issue.lastErrorReportTime))) {
		throw new Error('Google Play Developer Reporting API returned an issue with invalid identity or last occurrence');
	}

	return {
		name: issue.name,
		type: issue.type ?? 'UNKNOWN',
		cause: issue.cause ?? '',
		location: issue.location ?? '',
		errorReportCount: issue.errorReportCount ?? '0',
		distinctUsers: issue.distinctUsers ?? '0',
		lastErrorReportTime: issue.lastErrorReportTime,
		issueUri: issue.issueUri ?? '',
		firstAppVersionCode: issue.firstAppVersion?.versionCode ?? '',
		lastAppVersionCode: issue.lastAppVersion?.versionCode ?? '',
		sampleErrorReports: issue.sampleErrorReports ?? []
	};
}

/**
 * Build a snapshot that also remembers clusters outside today's rolling window.
 * On the first run, establish a baseline rather than reporting all old issues as new.
 * @param {string} packageName
 * @param {import('./types.js').MonitorInterval} interval
 * @param {import('./types.js').GooglePlayErrorIssue[]} rawIssues
 * @param {object|null} [previous=null] A report from the previous run, or null to establish a baseline.
 * @param {Date} [now=new Date()] The timestamp to use when generating the report.
 */
function createReport(packageName, interval, rawIssues, previous = null, now = new Date()) {
	if (previous && (previous.schemaVersion !== SCHEMA_VERSION || previous.packageName !== packageName || typeof previous.history !== 'object' || !previous.history || Array.isArray(previous.history))) {
		throw new Error('Previous report has an unsupported schema or belongs to a different app');
	}

	const issues = rawIssues.map(normalizeIssue);
	issues.sort((a, b) => b.lastErrorReportTime.localeCompare(a.lastErrorReportTime));

	const history = { ...(previous?.history ?? {}) };
	const changes = { new: [], resurfaced: [], updated: [] };

	for (const issue of issues) {
		const prior = history[issue.name];
		const currentTime = Date.parse(issue.lastErrorReportTime);
		const previousTime = prior ? Date.parse(prior.lastErrorReportTime) : -Infinity;

		if (prior && !Number.isFinite(previousTime)) {
			throw new Error('Previous report history contains an invalid last occurrence');
		}

		if (previous && !prior) {
			changes.new.push(issue.name);
		}

		if (previous && prior && currentTime > previousTime) {
			if (previousTime < Date.parse(interval.start)) {
				changes.resurfaced.push(issue.name);
			} else {
				changes.updated.push(issue.name);
			}
		}

		let lastErrorReportTime = issue.lastErrorReportTime;

		if (prior && previousTime > currentTime) {
			lastErrorReportTime = prior.lastErrorReportTime;
		}

		history[issue.name] = {
			lastErrorReportTime,
			type: issue.type,
			cause: issue.cause,
			location: issue.location
		};
	}

	return {
		schemaVersion: SCHEMA_VERSION,
		packageName,
		generatedAt: now.toISOString(),
		interval,
		baseline: !previous,
		issues,
		history,
		changes
	};
}

/**
 * Render a report for the caller to display in its GitHub Actions job summary.
 */
function renderMarkdown(report) {
	const escape = value => String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/\u0060/g, '\\`');
	const status = issue => {
		if (report.changes.new.includes(issue.name)) {
			return 'New';
		}

		if (report.changes.resurfaced.includes(issue.name)) {
			return 'Resurfaced';
		}

		if (report.changes.updated.includes(issue.name)) {
			return 'Updated';
		}

		return 'Previously seen';
	};

	const lines = [
		`## Google Play Vitals: ${escape(report.packageName)}`,
		'',
		`Interval: ${report.interval.start} to ${report.interval.end} (UTC, end exclusive)`,
		'',
		`Crash/ANR clusters observed: **${report.issues.length}**`,
		''
	];

	if (report.baseline) {
		lines.push('Baseline run. Existing clusters have been recorded without classifying them as new.', '');
	} else {
		lines.push(`New: **${report.changes.new.length}** | Resurfaced: **${report.changes.resurfaced.length}** | Updated: **${report.changes.updated.length}**`, '');
	}

	if (report.issues.length === 0) {
		lines.push('No crash or ANR clusters were reported in this interval.');
		return `${lines.join('\n')}\n`;
	}

	lines.push('| Status | Type | Cause | Location | Events | Users | Version code | Last event (UTC) | Console |');
	lines.push('| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |');

	for (const issue of report.issues) {
		const uri = /^https:\/\//.test(issue.issueUri) ? `[Open](${issue.issueUri})` : '';
		lines.push(`| ${status(issue)} | ${escape(issue.type)} | ${escape(issue.cause)} | ${escape(issue.location)} | ${escape(issue.errorReportCount)} | ${escape(issue.distinctUsers)} | ${escape(issue.lastAppVersionCode)} | ${escape(issue.lastErrorReportTime)} | ${uri} |`);
	}

	return `${lines.join('\n')}\n`;
}

export { createReport, renderMarkdown };
