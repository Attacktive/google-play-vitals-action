import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchIssues } from './client.js';
import { createReport, renderMarkdown } from './report.js';

/**
 * Read inputs through the environment variables provided by the GitHub Actions runner.
 */
function input(name, required = false) {
	const value = (process.env[`INPUT_${name.toUpperCase()}`] ?? '').trim();

	if (required && !value) {
		throw new Error(`Missing required input: ${name}`);
	}

	return value;
}

/**
 * Export short scalar values through the runner's output file.
 */
async function setOutput(name, value) {
	if (process.env.GITHUB_OUTPUT) {
		await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
	}
}

async function run() {
	const packageName = input('package-name', true);
	if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
		throw new Error('package-name must be an Android application package name');
	}
	const rawHours = input('lookback-hours') || '72';
	const lookbackHours = Number(rawHours);

	if (!Number.isInteger(lookbackHours) || lookbackHours < 1 || lookbackHours > 720) {
		throw new Error('lookback-hours must be an integer between 1 and 720');
	}

	const accessToken = input('google-access-token', true);
	const priorPath = input('previous-report');

	console.log(`::add-mask::${accessToken}`);

	const directory = path.resolve(input('output-directory') || 'play-vitals');
	const previous = priorPath ? JSON.parse(await readFile(priorPath, 'utf8')) : null;

	const { interval, issues } = await fetchIssues(packageName, accessToken, lookbackHours);
	const report = createReport(packageName, interval, issues, previous);
	const reportFile = path.join(directory, 'report.json');
	const markdownFile = path.join(directory, 'report.md');

	await mkdir(directory, { recursive: true });
	await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
	await writeFile(markdownFile, renderMarkdown(report));

	await setOutput('report-file', reportFile);
	await setOutput('markdown-file', markdownFile);
	await setOutput('issue-count', report.issues.length);
	await setOutput('new-issues', report.changes.new.length);
	await setOutput('resurfaced-issues', report.changes.resurfaced.length);
	await setOutput('updated-issues', report.changes.updated.length);
	await setOutput('has-changes', Boolean(report.changes.new.length || report.changes.resurfaced.length || report.changes.updated.length));

	console.log(`Wrote Google Play vitals report for ${packageName}: ${report.issues.length} issues`);
}

try {
	await run();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`::error::${message.replace(/[\r\n]/g, ' ')}`);

	process.exitCode = 1;
}
