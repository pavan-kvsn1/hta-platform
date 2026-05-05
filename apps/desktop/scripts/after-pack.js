/**
 * electron-builder afterPack hook.
 * Copies the Next.js standalone output (with node_modules) directly into
 * the packaged app's resources directory, bypassing electron-builder's
 * default node_modules filtering on extraResources.
 */
const fs = require('fs')
const path = require('path')

module.exports = async function afterPack(context) {
  const src = path.join(__dirname, '..', '.next-standalone')
  const dest = path.join(context.appOutDir, 'resources', 'next-app')

  if (!fs.existsSync(src)) {
    console.warn('[after-pack] .next-standalone not found, skipping copy')
    return
  }

  console.log('[after-pack] Copying standalone output to:', dest)
  copyDirRecursive(src, dest)
  console.log('[after-pack] Done')
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name)
    const destPath = path.join(dest, name)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
