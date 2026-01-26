#!/usr/bin/env node
/**
 * Release Script
 * ==============
 *
 * This script automates the release process:
 * 1. Runs tests to ensure everything passes
 * 2. Bumps the minor version in package.json
 * 3. Generates CHANGELOG.md from commit messages since last tag
 * 4. Commits the version bump and changelog
 * 5. Pushes to main (which triggers the publish workflow)
 *
 * Usage:
 *   node scripts/release.js [--major|--minor|--patch]
 *
 * Options:
 *   --major   Bump major version (1.0.0 -> 2.0.0)
 *   --minor   Bump minor version (1.0.0 -> 1.1.0) [default]
 *   --patch   Bump patch version (1.0.0 -> 1.0.1)
 *   --dry-run Show what would happen without making changes
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PACKAGE_JSON = path.join(ROOT, 'package.json')
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md')

// Parse arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const bumpType = args.includes('--major')
  ? 'major'
  : args.includes('--patch')
    ? 'patch'
    : 'minor'

function exec(cmd, options = {}) {
  console.log(`\x1b[90m$ ${cmd}\x1b[0m`)
  if (dryRun && !options.allowInDryRun) {
    console.log('\x1b[33m[dry-run] Skipped\x1b[0m')
    return ''
  }
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', ...options }).trim()
}

function log(msg) {
  console.log(`\x1b[32m[release]\x1b[0m ${msg}`)
}

function error(msg) {
  console.error(`\x1b[31m[error]\x1b[0m ${msg}`)
  process.exit(1)
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      return `${major}.${minor + 1}.0`
  }
}

function getLastTag() {
  try {
    return exec('git describe --tags --abbrev=0 2>/dev/null', { allowInDryRun: true })
  } catch {
    return null
  }
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    const output = exec(`git log ${range} --pretty=format:"%s" --no-merges`, {
      allowInDryRun: true,
    })
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

function generateChangelog(version, commits) {
  let content = ''

  // Read existing changelog if it exists
  if (fs.existsSync(CHANGELOG)) {
    content = fs.readFileSync(CHANGELOG, 'utf-8')
  }

  // Generate new entry
  const newEntry = [
    `## v${version}`,
    '',
    ...commits.map((msg) => `- ${msg}`),
  ].join('\n')

  // Prepend new entry (after header if exists)
  if (content.startsWith('# Change log')) {
    const headerEnd = content.indexOf('\n\n') + 2
    content = content.slice(0, headerEnd) + newEntry + '\n\n' + content.slice(headerEnd)
  } else {
    content = `# Change log\n\n${newEntry}\n\n${content}`
  }

  return content
}

async function main() {
  console.log('')
  console.log('==========================================')
  console.log('  Release Script')
  console.log('==========================================')
  console.log('')

  if (dryRun) {
    console.log('\x1b[33m[dry-run mode] No changes will be made\x1b[0m\n')
  }

  // Check we're on main branch
  const branch = exec('git branch --show-current', { allowInDryRun: true })
  if (branch !== 'main') {
    error(`Must be on main branch to release (currently on ${branch})`)
  }

  // Check for uncommitted changes
  const status = exec('git status --porcelain', { allowInDryRun: true })
  if (status) {
    error('Working directory has uncommitted changes. Please commit or stash them first.')
  }

  // Pull latest
  log('Pulling latest changes...')
  exec('git pull --rebase')

  // Run tests
  log('Running tests...')
  try {
    exec('npm test', { stdio: 'inherit', allowInDryRun: true })
  } catch {
    error('Tests failed. Fix them before releasing.')
  }

  // Read package.json
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8'))
  const oldVersion = pkg.version
  const newVersion = bumpVersion(oldVersion, bumpType)

  log(`Bumping version: ${oldVersion} -> ${newVersion} (${bumpType})`)

  // Get commits since last tag
  const lastTag = getLastTag()
  log(lastTag ? `Last tag: ${lastTag}` : 'No previous tags found')

  const commits = getCommitsSinceTag(lastTag)
  if (commits.length === 0) {
    error('No commits since last tag. Nothing to release.')
  }

  log(`Found ${commits.length} commits since last release:`)
  commits.forEach((msg) => console.log(`  - ${msg}`))
  console.log('')

  // Update package.json
  pkg.version = newVersion
  if (!dryRun) {
    fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n')
  }
  log('Updated package.json')

  // Generate changelog
  const changelog = generateChangelog(newVersion, commits)
  if (!dryRun) {
    fs.writeFileSync(CHANGELOG, changelog)
  }
  log('Updated CHANGELOG.md')

  // Commit changes
  log('Committing changes...')
  exec('git add package.json CHANGELOG.md')
  exec(`git commit -m "chore: release v${newVersion}"`)

  // Create tag
  log(`Creating tag v${newVersion}...`)
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`)

  // Push
  log('Pushing to remote...')
  exec('git push && git push --tags')

  console.log('')
  log(`\x1b[32mRelease v${newVersion} complete!\x1b[0m`)
  console.log('')
  console.log('The publish workflow will now run on GitHub Actions.')
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
