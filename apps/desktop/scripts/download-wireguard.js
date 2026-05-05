#!/usr/bin/env node
/**
 * Download the WireGuard Windows MSI installer at build time.
 *
 * Fetches from the official WireGuard download server and verifies the
 * SHA-256 checksum before saving to resources/wireguard-amd64.msi.
 *
 * Usage: node scripts/download-wireguard.js
 *
 * Pin a specific version by setting WG_VERSION env var (e.g. 0.5.3).
 * Otherwise the latest stable from download.wireguard.com is used.
 */

'use strict'

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Pinned version — update this when you want to bump WireGuard
const PINNED_VERSION = process.env.WG_VERSION || '0.5.3'

// Official download URL (amd64 Windows MSI)
const MSI_URL = `https://download.wireguard.com/windows-client/wireguard-installer.exe`

// Known-good SHA-256 hashes keyed by version string.
// Add entries as new versions are pinned.
// Run: curl -sL <URL> | sha256sum   to get the hash for a new version.
const KNOWN_HASHES = {
  '0.5.3': "309ddac63863e9bff362dc93576a1e981af87d2aa1b68ef3b0dbd3b10d965407", // Set to null = skip checksum verification (fetch live hash)
}

const DEST = path.join(__dirname, '..', 'resources', 'wireguard-amd64.msi')

// ---------------------------------------------------------------------------

async function fetchToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const hash = crypto.createHash('sha256')

    const get = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${u}`))
          return
        }
        res.pipe(file)
        res.on('data', (chunk) => hash.update(chunk))
        res.on('end', () => {
          file.end()
          resolve(hash.digest('hex'))
        })
        res.on('error', reject)
      }).on('error', reject)
    }

    get(url)
  })
}

async function main() {
  console.log(`[download-wireguard] Fetching WireGuard installer (version pin: ${PINNED_VERSION})`)
  console.log(`[download-wireguard] URL: ${MSI_URL}`)
  console.log(`[download-wireguard] Dest: ${DEST}`)

  // Ensure resources dir exists
  fs.mkdirSync(path.dirname(DEST), { recursive: true })

  // Skip download if file already exists (CI cache hit)
  if (fs.existsSync(DEST)) {
    console.log('[download-wireguard] File already exists — skipping download (delete to re-fetch)')
    return
  }

  const downloadedHash = await fetchToFile(MSI_URL, DEST)
  console.log(`[download-wireguard] SHA-256: ${downloadedHash}`)

  const expectedHash = KNOWN_HASHES[PINNED_VERSION]
  if (expectedHash && downloadedHash !== expectedHash) {
    fs.unlinkSync(DEST)
    throw new Error(
      `[download-wireguard] Checksum mismatch!\n  Expected: ${expectedHash}\n  Got:      ${downloadedHash}\n\nDelete the pinned hash entry to skip verification, or update it.`
    )
  }

  if (!expectedHash) {
    console.warn(
      `[download-wireguard] WARNING: No pinned hash for version ${PINNED_VERSION}. ` +
      `Add the hash above to KNOWN_HASHES in this script to enable checksum verification.`
    )
  } else {
    console.log('[download-wireguard] Checksum OK')
  }

  console.log('[download-wireguard] Done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
