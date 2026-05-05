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

const ENV_LOCAL = path.join(WEB_DIR, '.env.local')
const ENV_BACKUP = path.join(WEB_DIR, '.env.local.bak')
const ENV_DESKTOP = path.join(WEB_DIR, '.env.desktop')

function run(cmd, cwd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

try {
  // Step 1: Build web app with desktop env
  console.log('\n=== Step 1/4: Building web app with .env.desktop ===')
  if (fs.existsSync(ENV_LOCAL)) {
    fs.copyFileSync(ENV_LOCAL, ENV_BACKUP)
  }
  fs.copyFileSync(ENV_DESKTOP, ENV_LOCAL)

  const nextDir = path.join(WEB_DIR, '.next')
  if (fs.existsSync(nextDir)) {
    try { fs.rmSync(nextDir, { recursive: true, force: true }) } catch {
      run('cmd /c "rmdir /s /q .next"', WEB_DIR)
    }
  }
  run('npm run build', WEB_DIR)

  // Restore .env.local
  if (fs.existsSync(ENV_BACKUP)) {
    fs.copyFileSync(ENV_BACKUP, ENV_LOCAL)
  }

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
  run('npx electron-builder --win --dir', DESKTOP_DIR)

  console.log('\n=== Build complete! ===')
  console.log(`Output: ${unpackedDir}`)
} catch (err) {
  // Restore .env.local on failure
  if (fs.existsSync(ENV_BACKUP)) {
    fs.copyFileSync(ENV_BACKUP, ENV_LOCAL)
  }
  console.error('\nBuild failed:', err.message)
  process.exit(1)
}
