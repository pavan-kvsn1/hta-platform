/**
 * Full desktop build script.
 * Runs all 4 steps in order:
 *   1. Build web app with .env.desktop
 *   2. Copy standalone output (prepackage)
 *   3. Build desktop TypeScript
 *   4. Package with electron-builder
 *
 * Usage: npm run build:full
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const WEB_DIR = path.join(ROOT, 'apps', 'web-hta')
const DESKTOP_DIR = path.join(ROOT, 'apps', 'desktop')

const ENV_DESKTOP = path.join(WEB_DIR, '.env.desktop')

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Desktop env file not found: ${filePath}`)
  }

  const parsed = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue

    const key = match[1]
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }

  return parsed
}

function run(cmd, cwd, extraEnv = {}) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
}

function cleanNextBuildPreservingCache() {
  const nextDir = path.join(WEB_DIR, '.next')
  const cacheDir = path.join(nextDir, 'cache')
  const cacheBackup = path.join(WEB_DIR, '.next-cache-desktop-build')

  if (!fs.existsSync(nextDir)) return

  if (fs.existsSync(cacheBackup)) {
    fs.rmSync(cacheBackup, { recursive: true, force: true })
  }

  if (fs.existsSync(cacheDir)) {
    fs.renameSync(cacheDir, cacheBackup)
  }

  try {
    fs.rmSync(nextDir, { recursive: true, force: true })
  } catch {
    run('cmd /c "rmdir /s /q .next"', WEB_DIR)
  }

  if (fs.existsSync(cacheBackup)) {
    fs.mkdirSync(nextDir, { recursive: true })
    fs.renameSync(cacheBackup, cacheDir)
  }
}

try {
  // Step 1: Build web app with desktop env
  console.log('\n=== Step 1/4: Building web app with .env.desktop ===')
  const desktopEnv = readEnvFile(ENV_DESKTOP)

  if (process.argv.includes('--clean-next')) {
    cleanNextBuildPreservingCache()
  } else {
    console.log('Keeping existing .next build/cache for incremental desktop build')
  }
  run('npm run build', WEB_DIR, desktopEnv)

  // Step 2: Prepackage (copy standalone + download WireGuard)
  console.log('\n=== Step 2/4: Prepackage ===')
  run('npm run prepackage', DESKTOP_DIR)

  // Step 3: Build desktop TypeScript
  console.log('\n=== Step 3/4: Building desktop TypeScript ===')
  run('npm run build', DESKTOP_DIR)

  // Step 4: Package with electron-builder
  console.log('\n=== Step 4/4: Packaging ===')
  const unpackedDir = path.join(DESKTOP_DIR, 'release', 'win-unpacked')
  if (fs.existsSync(unpackedDir)) {
    try { fs.rmSync(unpackedDir, { recursive: true, force: true }) } catch {
      run('cmd /c "rmdir /s /q release\\win-unpacked"', DESKTOP_DIR)
    }
  }
  // --dir for unpacked, remove --dir for NSIS installer
  const installerMode = process.argv.includes('--installer')
  if (installerMode) {
    run('npx electron-builder --win', DESKTOP_DIR)
  } else {
    run('npx electron-builder --win --dir', DESKTOP_DIR)
  }

  console.log('\n=== Build complete! ===')
  if (installerMode) {
    console.log(`Installer: ${path.join(DESKTOP_DIR, 'release')}`)
  } else {
    console.log(`Output: ${unpackedDir}`)
  }
} catch (err) {
  console.error('\nBuild failed:', err.message)
  process.exit(1)
}
