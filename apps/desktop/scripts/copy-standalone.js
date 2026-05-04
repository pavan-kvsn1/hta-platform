/**
 * Copy Next.js standalone output with symlinks dereferenced and
 * pnpm .pnpm store hoisted to standard node_modules layout.
 *
 * pnpm + Next.js standalone creates symlinks pointing back to the monorepo
 * .pnpm store. These don't survive electron-builder packaging. This script:
 * 1. Copies the standalone tree with symlinks resolved to real files
 * 2. Hoists packages from .pnpm/ flat store to node_modules/ so Node's
 *    module resolution can find them (e.g., styled-jsx, react, react-dom)
 * 3. Copies .next/static and public into the correct locations
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const WEB_HTA = path.join(ROOT, 'apps', 'web-hta')
const STANDALONE = path.join(WEB_HTA, '.next', 'standalone')
const DEST = path.join(__dirname, '..', '.next-standalone')

// Clean destination
if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true })
}

console.log('[copy-standalone] Copying standalone output (dereferencing symlinks)...')
copyDirDeref(STANDALONE, DEST)

// Hoist pnpm .pnpm packages to standard node_modules for both root and app-level
hoistPnpmPackages(path.join(DEST, 'node_modules'))
hoistPnpmPackages(path.join(DEST, 'apps', 'web-hta', 'node_modules'))

// Copy .next/static → dest/apps/web-hta/.next/static
const staticSrc = path.join(WEB_HTA, '.next', 'static')
const staticDest = path.join(DEST, 'apps', 'web-hta', '.next', 'static')
if (fs.existsSync(staticSrc)) {
  console.log('[copy-standalone] Copying .next/static...')
  copyDirDeref(staticSrc, staticDest)
}

// Copy public → dest/apps/web-hta/public
const publicSrc = path.join(WEB_HTA, 'public')
const publicDest = path.join(DEST, 'apps', 'web-hta', 'public')
if (fs.existsSync(publicSrc)) {
  console.log('[copy-standalone] Copying public/...')
  copyDirDeref(publicSrc, publicDest)
}

console.log('[copy-standalone] Done. Output at:', DEST)

/**
 * Recursively copy a directory, following symlinks (dereferencing them).
 */
function copyDirDeref(src, dest) {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    // Resolve symlinks to get the real path
    let realPath = srcPath
    try {
      realPath = fs.realpathSync(srcPath)
    } catch {
      // Broken symlink — skip
      console.warn('[copy-standalone] Skipping broken symlink:', srcPath)
      continue
    }

    const stat = fs.statSync(realPath)

    if (stat.isDirectory()) {
      copyDirDeref(realPath, destPath)
    } else {
      fs.copyFileSync(realPath, destPath)
    }
  }
}

/**
 * Hoist packages from pnpm's .pnpm/ flat store into standard node_modules/.
 *
 * pnpm standalone structure:
 *   node_modules/.pnpm/styled-jsx@5.1.6_xxx/node_modules/styled-jsx/
 *
 * After hoisting:
 *   node_modules/styled-jsx/  (copy of the real package)
 *
 * This makes packages resolvable via Node's standard module resolution.
 */
function hoistPnpmPackages(nodeModulesDir) {
  const pnpmDir = path.join(nodeModulesDir, '.pnpm')
  if (!fs.existsSync(pnpmDir)) return

  let hoisted = 0

  for (const storePkg of fs.readdirSync(pnpmDir)) {
    const innerNodeModules = path.join(pnpmDir, storePkg, 'node_modules')
    if (!fs.existsSync(innerNodeModules)) continue

    for (const pkg of fs.readdirSync(innerNodeModules)) {
      // Handle scoped packages (@scope/name)
      if (pkg.startsWith('@')) {
        const scopeDir = path.join(innerNodeModules, pkg)
        if (!fs.statSync(scopeDir).isDirectory()) continue
        for (const scopedPkg of fs.readdirSync(scopeDir)) {
          const srcPkg = path.join(scopeDir, scopedPkg)
          const destPkg = path.join(nodeModulesDir, pkg, scopedPkg)
          if (!fs.existsSync(destPkg) && fs.statSync(srcPkg).isDirectory()) {
            copyDirDeref(srcPkg, destPkg)
            hoisted++
          }
        }
      } else {
        const srcPkg = path.join(innerNodeModules, pkg)
        const destPkg = path.join(nodeModulesDir, pkg)
        if (!fs.existsSync(destPkg) && fs.statSync(srcPkg).isDirectory()) {
          copyDirDeref(srcPkg, destPkg)
          hoisted++
        }
      }
    }
  }

  console.log(`[copy-standalone] Hoisted ${hoisted} packages in ${nodeModulesDir}`)
}
