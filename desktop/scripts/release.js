const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const semver = require('semver');

const bump = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Verwendung: npm run desktop:release -- patch|minor|major');
  process.exit(1);
}
if (!process.env.GH_TOKEN) {
  console.error('GH_TOKEN fehlt. Das Token wird nur aus der Umgebung gelesen.');
  process.exit(1);
}

const desktopRoot = path.join(__dirname, '..');
const repositoryRoot = path.join(desktopRoot, '..');
const packagePath = path.join(desktopRoot, 'package.json');

function run(command, args, cwd = desktopRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const currentPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const nextVersion = semver.inc(currentPackage.version, bump);

run('npm', ['test'], repositoryRoot);
run('npm', ['run', 'test', '--workspace', 'guildora-desktop'], repositoryRoot);
run('npm', ['version', nextVersion, '--workspace', 'guildora-desktop', '--no-git-tag-version'], repositoryRoot);

const desktopPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
run('npm', ['run', 'build'], repositoryRoot);
console.log(`Desktop-Version auf ${desktopPackage.version} erhöht.`);
run('npx', ['electron-builder', '--win', '--publish', 'always']);
process.env.RELEASE_VERSION = desktopPackage.version;
run('node', [path.join('scripts', 'verify-release.js')]);
