/**
 * VPN IPC handlers — WireGuard provisioning and status
 *
 * vpn:provision  — generates a WireGuard keypair, calls POST /api/vpn/provision,
 *                  builds hta-vpn.conf, installs the tunnel service, saves flag to safeStorage
 * vpn:status     — checks whether the hta-vpn WireGuard tunnel service is running
 */

import { app, safeStorage } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

const execFileAsync = promisify(execFile)

// WireGuard CLI is installed to this default path by the MSI installer
const WG_EXE = 'C:\\Program Files\\WireGuard\\wireguard.exe'
const WG_TOOL = 'C:\\Program Files\\WireGuard\\wg.exe'

const VPN_FLAG_FILE = path.join(app.getPath('userData'), '.vpn-provisioned')
const REPROVISION_TOKEN_FILE = path.join(app.getPath('userData'), '.reprovision-token')

/** Load the stored re-provision token (for auto-heal) */
export function loadReprovisionToken(): string | null {
  try {
    if (!fs.existsSync(REPROVISION_TOKEN_FILE)) return null
    const encrypted = fs.readFileSync(REPROVISION_TOKEN_FILE)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  const { execSync } = require('child_process')

  // wg genkey outputs the private key on stdout
  const privateKey = execSync(`"${WG_TOOL}" genkey`, { encoding: 'utf8' }).trim()

  // wg pubkey takes privkey on stdin and outputs pubkey
  const publicKey = execSync(`echo ${privateKey} | "${WG_TOOL}" pubkey`, {
    encoding: 'utf8',
    shell: 'cmd.exe',
  }).trim()

  return { privateKey, publicKey }
}

function buildWgConf(params: {
  privateKey: string
  assignedIp: string
  serverPublicKey: string
  serverEndpoint: string
  serverIp: string
}): string {
  return [
    '[Interface]',
    `PrivateKey = ${params.privateKey}`,
    `Address = ${params.assignedIp}/32`,
    // No DNS line — system DNS stays untouched
    '',
    '[Peer]',
    `PublicKey = ${params.serverPublicKey}`,
    `Endpoint = ${params.serverEndpoint}`,
    // Only route the API subnet through the tunnel — don't intercept all traffic
    `AllowedIPs = ${params.serverIp}/32, 10.8.3.0/24`,
    `PersistentKeepalive = 25`,
    '',
  ].join('\n')
}

function makeRequest(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string }
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString())
            resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0, data })
          } catch {
            resolve({ ok: false, status: res.statusCode ?? 0, data: null })
          }
        })
      }
    )
    req.on('error', reject)
    req.write(options.body)
    req.end()
  })
}

// ─── Exported IPC handlers ───────────────────────────────────────────────────

/**
 * Provision VPN for this machine.
 * Called from the first-run provisioning screen with the token from offline-codes page.
 */
export async function vpnProvision(
  token: string,
  apiBase: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Generate key pair
    console.log('[vpn] Generating key pair...')
    const { privateKey, publicKey } = await generateKeyPair()
    console.log('[vpn] Key pair generated. Public key:', publicKey.slice(0, 10) + '...')

    // 2. Call provisioning API
    console.log('[vpn] Calling provisioning API at:', `${apiBase}/api/vpn/provision`)
    const res = await makeRequest(`${apiBase}/api/vpn/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, publicKey }),
    })

    console.log('[vpn] API response:', res.status, JSON.stringify(res.data))
    if (!res.ok) {
      const errorMsg = (res.data as { error?: string })?.error || `HTTP ${res.status}`
      return { success: false, error: errorMsg }
    }

    const config = res.data as {
      serverPublicKey: string
      serverEndpoint: string
      assignedIp: string
      serverIp: string
      reprovisionToken?: string
    }

    // Store re-provision token for auto-heal (survives app restarts via safeStorage)
    if (config.reprovisionToken) {
      const rpTokenPath = path.join(app.getPath('userData'), '.reprovision-token')
      fs.writeFileSync(rpTokenPath, safeStorage.encryptString(config.reprovisionToken))
      console.log('[vpn] Re-provision token stored')
    }

    // 3. Write hta-vpn.conf to a temp directory
    const confDir = path.join(app.getPath('temp'), 'hta-vpn')
    fs.mkdirSync(confDir, { recursive: true })
    const confPath = path.join(confDir, 'hta-vpn.conf')

    const wgConf = buildWgConf({
      privateKey,
      assignedIp: config.assignedIp,
      serverPublicKey: config.serverPublicKey,
      serverEndpoint: config.serverEndpoint,
      serverIp: config.serverIp,
    })

    fs.writeFileSync(confPath, wgConf, { mode: 0o600 })

    // 4. Uninstall existing tunnel (if any) then install fresh via batch script
    console.log('[vpn] Installing tunnel service from:', confPath)
    const { execSync: runSync } = require('child_process')

    // Write a batch script that does uninstall + install in one elevated session
    const batPath = path.join(app.getPath('temp'), 'hta-vpn-install.bat')
    const batContent = [
      '@echo off',
      `"${WG_EXE}" /uninstalltunnelservice hta-vpn 2>nul`,
      'timeout /t 2 /nobreak >nul',
      `"${WG_EXE}" /installtunnelservice "${confPath}"`,
    ].join('\r\n')
    fs.writeFileSync(batPath, batContent)

    // Run the batch script elevated (single UAC prompt for both operations)
    runSync(
      `powershell -Command "Start-Process -FilePath '${batPath}' -Verb RunAs -Wait"`,
      { encoding: 'utf8', timeout: 60000 }
    )
    console.log('[vpn] Tunnel service install completed')

    // Verify service exists
    try {
      const { stdout } = await execFileAsync('sc', ['query', 'WireGuardTunnel$hta-vpn'])
      if (stdout.includes('RUNNING')) {
        console.log('[vpn] Tunnel service verified RUNNING')
      } else {
        console.warn('[vpn] Tunnel service not running after install')
      }
    } catch {
      console.error('[vpn] Tunnel service NOT FOUND after install')
    }

    // 6. Persist provisioned flag via Electron safeStorage (DPAPI-backed on Windows)
    const flagValue = safeStorage.encryptString('true')
    fs.writeFileSync(VPN_FLAG_FILE, flagValue)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Check WireGuard tunnel service status + actual connectivity */
export async function vpnStatus(): Promise<{ configured: boolean; serviceRunning: boolean; connected: boolean; active: boolean }> {
  const configured = fs.existsSync(VPN_FLAG_FILE)

  if (!configured) return { configured: false, serviceRunning: false, connected: false, active: false }

  let serviceRunning = false
  try {
    const { stdout } = await execFileAsync('sc', ['query', 'WireGuardTunnel$hta-vpn'])
    serviceRunning = stdout.includes('RUNNING')
  } catch {
    serviceRunning = false
  }

  let connected = false
  if (serviceRunning) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      await fetch('http://10.100.0.1/', { signal: controller.signal })
      clearTimeout(timeout)
      connected = true
    } catch {
      connected = false
    }
  }

  return { configured, serviceRunning, connected, active: serviceRunning }
}
