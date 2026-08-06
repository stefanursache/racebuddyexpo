#!/usr/bin/env node
const { execSync } = require('child_process');

// Safety: require AUTO_PUSH=true to actually push.
const AUTO_PUSH = process.env.AUTO_PUSH === 'true';
const repoPath = process.argv[2] || process.cwd();
const commitMsgArg = process.argv[3];

function run(cmd, opts = {}) {
    return execSync(cmd, { encoding: 'utf8', ...opts });
}

try {
    run('git rev-parse --is-inside-work-tree', { cwd: repoPath });
} catch (err) {
    console.error('Not a git repository:', repoPath);
    process.exit(1);
}

const status = run('git status --porcelain', { cwd: repoPath }).trim();
if (!status) {
    console.log('No changes to commit.');
    process.exit(0);
}

const branch = run('git rev-parse --abbrev-ref HEAD', { cwd: repoPath }).trim();
const timestamp = new Date().toISOString();
const commitMessage = commitMsgArg || `Auto-update by GitPushAgent ${timestamp}`;

console.log(`Found changes on branch ${branch}. Preparing commit.`);
run('git add -A', { cwd: repoPath, stdio: 'inherit' });

try {
    run(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: repoPath, stdio: 'inherit' });
} catch (err) {
    console.error('Commit failed (maybe no staged changes):', err.message);
    process.exit(1);
}

if (!AUTO_PUSH) {
    console.log('AUTO_PUSH is not enabled. Set AUTO_PUSH=true to allow pushing.');
    process.exit(0);
}

try {
    console.log('Pushing to remote...');
    run('git push', { cwd: repoPath, stdio: 'inherit' });
    console.log('Push completed.');
} catch (err) {
    console.error('Push failed:', err.message);
    process.exit(1);
}
