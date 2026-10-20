import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReport, renderMarkdown } from '../src/report.js';

const packageName = 'com.example.app';
const interval = {
	start: '2026-10-17T03:00:00.000Z',
	end: '2026-10-20T03:00:00.000Z'
};

/**
 * Produce one realistic Google Play ErrorIssue fixture.
 */
function issue(name, lastTime = '2026-10-20T01:00:00Z') {
	return {
		name,
		type: 'CRASH',
		cause: 'IllegalStateException',
		location: 'MainActivity.onCreate',
		errorReportCount: '2',
		distinctUsers: '1',
		lastErrorReportTime: lastTime,
		issueUri: 'https://play.google.com/console',
		lastAppVersion: { versionCode: '52' }
	};
}

test(
	'first run establishes a baseline without false new-issue notifications',
	() => {
		const report = createReport(packageName, interval, [issue('apps/com.example.app/errorIssues/1')]);

		assert.equal(report.baseline, true);
		assert.equal(report.issues.length, 1);
		assert.deepEqual(report.changes, { new: [], resurfaced: [], updated: [] });
		assert.ok(report.history['apps/com.example.app/errorIssues/1']);
		assert.match(renderMarkdown(report), /Baseline run/);
	}
);

test(
	'distinguishes new, updated and unchanged clusters',
	() => {
		const first = createReport(
			packageName,
			interval,
			[
				issue('apps/com.example.app/errorIssues/a', '2026-10-19T01:00:00Z'),
				issue('apps/com.example.app/errorIssues/b', '2026-10-19T03:00:00Z')
			]
		);

		const report = createReport(
			packageName,
			interval,
			[
				issue('apps/com.example.app/errorIssues/a', '2026-10-20T01:00:00Z'),
				issue('apps/com.example.app/errorIssues/b', '2026-10-19T03:00:00Z'),
				issue('apps/com.example.app/errorIssues/c')
			],
			first
		);

		assert.equal(report.baseline, false);
		assert.deepEqual(report.changes.new, ['apps/com.example.app/errorIssues/c']);
		assert.deepEqual(report.changes.updated, ['apps/com.example.app/errorIssues/a']);
		assert.deepEqual(report.changes.resurfaced, []);
		assert.match(renderMarkdown(report), /New: \*\*1\*\*/);
	}
);

test(
	'detects resurfacing even when a cluster disappeared from yesterday\'s window',
	() => {
		const initial = createReport(
			packageName,
			interval,
			[issue('apps/com.example.app/errorIssues/a', '2026-10-10T01:00:00Z')]
		);

		const empty = createReport(packageName, interval, [], initial);

		const latest = createReport(
			packageName,
			interval,
			[issue('apps/com.example.app/errorIssues/a', '2026-10-20T01:00:00Z')],
			empty
		);

		assert.deepEqual(latest.changes.resurfaced, ['apps/com.example.app/errorIssues/a']);
		assert.deepEqual(latest.changes.new, []);
	}
);

test(
	'rejects unrelated previous state',
	() => {
		const prior = createReport('com.someone.else', interval, []);

		assert.throws(
			() => createReport(packageName, interval, [], prior),
			/different app/
		);
	}
);

test(
	'escapes untrusted Markdown in issue metadata',
	() => {
		const error = issue('apps/com.example.app/errorIssues/1');
		error.cause = 'Crash | Unexpected';
		const report = createReport(packageName, interval, [error]);
		const markdown = renderMarkdown(report);

		assert.equal(markdown.includes('Crash ' + String.fromCharCode(92) + '| Unexpected'), true);
		assert.match(markdown, /\[Open]\(https:\/\/play.google.com\/console\)/);
	}
);

test(
	'preserves the latest occurrence when a stale API window returns older data',
	() => {
		const name = 'apps/com.example.app/errorIssues/1';
		const first = createReport(packageName, interval, [issue(name, '2026-10-20T01:00:00Z')]);
		const second = createReport(packageName, interval, [issue(name, '2026-10-19T01:00:00Z')], first);
		const third = createReport(packageName, interval, [issue(name, '2026-10-20T01:00:00Z')], second);

		assert.equal(second.history[name].lastErrorReportTime, '2026-10-20T01:00:00Z');
		assert.deepEqual(third.changes, { new: [], resurfaced: [], updated: [] });
	}
);
