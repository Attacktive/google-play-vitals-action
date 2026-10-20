import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchIssues, issueSearchUrl, makeInterval } from '../src/client.js';

test(
	'generates an hour-aligned UTC interval and correct query parameters',
	() => {
		const interval = makeInterval(new Date('2026-10-20T03:49:10Z'), 72);
		const url = issueSearchUrl('com.example.app', interval, 'next token');

		assert.deepEqual(interval, {
			start: '2026-10-17T03:00:00.000Z',
			end: '2026-10-20T03:00:00.000Z'
		});

		assert.equal(url.pathname, '/v1beta1/apps/com.example.app/errorIssues:search');
		assert.equal(url.searchParams.get('interval.startTime.year'), '2026');
		assert.equal(url.searchParams.get('interval.startTime.day'), '17');
		assert.equal(url.searchParams.get('interval.startTime.hours'), '3');
		assert.equal(url.searchParams.get('interval.endTime.timeZone.id'), 'UTC');
		assert.equal(url.searchParams.get('filter'), 'errorIssueType = CRASH OR errorIssueType = ANR');
		assert.equal(url.searchParams.get('pageToken'), 'next token');
	}
);

test(
	'paginates issues without publishing partial results',
	async () => {
		const tokens = [];

		const request = async (url, init) => {
			assert.equal(init.headers.Authorization, 'Bearer test-token');
			const token = url.searchParams.get('pageToken') || '';
			tokens.push(token);

			if (token === '') {
				return Response.json({ errorIssues: [{ name: 'apps/com.example.app/errorIssues/1' }], nextPageToken: 'second' });
			}

			return Response.json({ errorIssues: [{ name: 'apps/com.example.app/errorIssues/2' }] });
		};

		const result = await fetchIssues(
			'com.example.app',
			'test-token',
			72,
			{
				fetch: request,
				now: new Date('2026-10-20T03:49:10Z')
			}
		);

		assert.deepEqual(tokens, ['', 'second']);
		assert.equal(result.issues.length, 2);
	}
);

test(
	'retries rate limits and server failures',
	async () => {
		const statuses = [429, 503, 200];
		let retries = 0;
		const request = async () => {
			const status = statuses.shift();

			if (status !== 200) {
				return new Response(null, { status });
			}

			return Response.json({ errorIssues: [] });
		};
		const result = await fetchIssues(
			'com.example.app', 'test-token',
			72,
			{
				fetch: request,
				sleep: async () => {
					retries++;
				}
			}
		);

		assert.equal(retries, 2);
		assert.equal(result.issues.length, 0);
	}
);

test(
	'fails visibly instead of reporting no issues on API errors',
	async () => {
		await assert.rejects(
			fetchIssues(
				'com.example.app',
				'token',
				72,
				{
					fetch: async () => new Response(null, { status: 403 })
				}
			),
			/HTTP 403/
		);

		await assert.rejects(
			fetchIssues(
				'com.example.app',
				'token',
				72,
				{
					fetch: async () => Response.json({ errorIssues: 'not an array' })
				}
			),
			/invalid issues response/
		);
	}
);

test(
	'rejects repeated pagination tokens',
	async () => {
		await assert.rejects(
			fetchIssues(
				'com.example.app',
				'token',
				72,
				{
					fetch: async () => Response.json({ errorIssues: [], nextPageToken: 'stuck' })
				}
			),
			/repeated page token/
		);
	}
);

test(
	'accepts an omitted errorIssues array when no clusters match',
	async () => {
		const result = await fetchIssues(
			'com.example.app',
			'token',
			72,
			{
				fetch: async () => Response.json({})
			}
		);

		assert.deepEqual(result.issues, []);
	}
);

test(
	'preserves the Google Play issue response field types',
	async () => {
		const response = {
			errorIssues: [
				{
					name: 'apps/com.example.app/errorIssues/123',
					type: 'APPLICATION_NOT_RESPONDING',
					cause: 'Input dispatching timed out',
					location: 'MainActivity',
					errorReportCount: '12',
					distinctUsers: '7',
					distinctUsersPercent: { value: '0.125' },
					lastErrorReportTime: '2026-10-20T03:00:00Z',
					firstOsVersion: { apiLevel: '31' },
					lastOsVersion: { apiLevel: '36' },
					firstAppVersion: { versionCode: '102' },
					lastAppVersion: { versionCode: '110' },
					annotations: [{ category: 'Insight', title: 'CPU', body: 'Main thread stalled' }],
					sampleErrorReports: ['apps/com.example.app/errorReports/456']
				}
			]
		};

		const result = await fetchIssues(
			'com.example.app',
			'token',
			72,
			{
				fetch: async () => Response.json(response)
			}
		);

		assert.deepEqual(result.issues, response.errorIssues);
		assert.equal(typeof result.issues[0].errorReportCount, 'string');
		assert.equal(result.issues[0].type, 'APPLICATION_NOT_RESPONDING');
	}
);
