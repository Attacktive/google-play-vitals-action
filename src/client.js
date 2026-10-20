const API_ROOT = 'https://playdeveloperreporting.googleapis.com/v1beta1';

/**
 * Calculate an hour-aligned UTC interval. Google Play does not accept partially elapsed hours.
 * @returns {import('./types.js').MonitorInterval}
 */
function makeInterval(now, lookbackHours) {
	const end = new Date(now);
	end.setUTCMinutes(0, 0, 0);

	const start = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);

	return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Encode DateTimeInterval fields using Google's REST nested query parameter notation.
 */
function appendDateTime(params, field, iso) {
	const value = new Date(iso);

	params.set(`${field}.year`, String(value.getUTCFullYear()));
	params.set(`${field}.month`, String(value.getUTCMonth() + 1));
	params.set(`${field}.day`, String(value.getUTCDate()));
	params.set(`${field}.hours`, String(value.getUTCHours()));
	params.set(`${field}.timeZone.id`, 'UTC');
}

/**
 * Build a Google Play Developer Reporting API issues.search URL.
 * @param {string} packageName
 * @param {import('./types.js').MonitorInterval} interval
 * @param {string} [pageToken]
 * @returns {URL}
 */
function issueSearchUrl(packageName, interval, pageToken = '') {
	const url = new URL(`${API_ROOT}/apps/${encodeURIComponent(packageName)}/errorIssues:search`);

	appendDateTime(url.searchParams, 'interval.startTime', interval.start);
	appendDateTime(url.searchParams, 'interval.endTime', interval.end);

	url.searchParams.set('filter', 'errorIssueType = CRASH OR errorIssueType = ANR');
	url.searchParams.set('pageSize', '1000');

	if (pageToken) {
		url.searchParams.set('pageToken', pageToken);
	}

	return url;
}

/**
 * Fetch all crash and ANR clusters. Never silently truncate a partial result.
 * @returns {Promise<import('./types.js').FetchedIssues>}
 */
async function fetchIssues(packageName, accessToken, lookbackHours = 72, options = {}) {
	const now = options.now ?? new Date();
	const request = options.fetch ?? fetch;
	const pause = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
	const interval = makeInterval(now, lookbackHours);
	/** @type {Map<string, import('./types.js').GooglePlayErrorIssue>} */
	const issues = new Map();
	const observedTokens = new Set();

	let pageToken = '';

	for (let page = 0; page < 100; page++) {
		const url = issueSearchUrl(packageName, interval, pageToken);
		let response;

		for (let attempt = 0; attempt < 4; attempt++) {
			response = await request(
				url,
				{
					headers: {
						Accept: 'application/json',
						Authorization: `Bearer ${accessToken}`
					},
					signal: AbortSignal.timeout(30_000)
				}
			);

			if (response.ok) {
				break;
			}

			if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
				throw new Error(`Google Play Developer Reporting API returned HTTP ${response.status}`);
			}

			await pause(500 * 2 ** attempt);
		}

		/** @type {import('./types.js').GooglePlayIssueSearchResponse} */
		const payload = await response.json();

		if (!payload || typeof payload !== 'object' || (payload.errorIssues !== undefined && !Array.isArray(payload.errorIssues))) {
			throw new Error('Google Play Developer Reporting API returned an invalid issues response');
		}

		for (const issue of payload.errorIssues ?? []) {
			if (!issue.name) {
				throw new Error('Google Play Developer Reporting API returned an issue without an identifier');
			}

			issues.set(issue.name, issue);
		}

		pageToken = payload.nextPageToken ?? '';

		if (!pageToken) {
			return { interval, issues: [...issues.values()] };
		}

		if (observedTokens.has(pageToken)) {
			throw new Error('Google Play Developer Reporting API returned a repeated page token');
		}

		observedTokens.add(pageToken);
	}

	throw new Error('Google Play Developer Reporting API exceeded 100 pages; refusing to publish an incomplete report');
}

export { fetchIssues, issueSearchUrl, makeInterval };
