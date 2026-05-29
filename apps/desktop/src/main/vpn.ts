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
import { getPrivateApiBase } from './api-config'

const execFileAsync = promisify(execFile)

// WireGuard CLI is installed to this default path by the MSI installer
const WG_EXE = 'C:\\Program Files\\WireGuard\\wireguard.exe'
const WG_TOOL = 'C:\\Program Files\\WireGuard\\wg.exe'

const VPN_FLAG_FILE = path.join(app.getPath('userData'), '.vpn-provisioned')
const REPROVISION_TOKEN_FILE = path.join(app.getPath('userData'), '.reprovision-token')
const WG_CONF_DIR = path.join(app.getPath('userData'), 'wireguard')
const WG_CONF_PATH = path.join(WG_CONF_DIR, 'hta-vpn.conf')

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function installTunnelServiceElevated(): Promise<void> {
  const scriptPath = path.join(app.getPath('temp'), 'hta-vpn-install.ps1')
  const resultPath = path.join(app.getPath('temp'), 'hta-vpn-install-result.json')

  try {
    if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath)
  } catch { /* ignore stale result cleanup */ }

  const script = [
    '$ErrorActionPreference = "Continue"',
    `$wireguard = ${psQuote(WG_EXE)}`,
    `$conf = ${psQuote(WG_CONF_PATH)}`,
    `$result = ${psQuote(resultPath)}`,
    'function Write-HtaResult([bool]$Success, [string]$Message, [string]$Details) {',
    '  $json = @{ success = $Success; message = $Message; details = $Details } | ConvertTo-Json -Compress',
    '  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)',
    '  [System.IO.File]::WriteAllText($result, $json, $utf8NoBom)',
    '}',
    'try {',
    '  if (-not (Test-Path -LiteralPath $wireguard)) {',
    '    Write-HtaResult $false "WireGuard executable not found." $wireguard',
    '    exit 1',
    '  }',
    '  if (-not (Test-Path -LiteralPath $conf)) {',
    '    Write-HtaResult $false "WireGuard configuration file not found." $conf',
    '    exit 1',
    '  }',
    '  & $wireguard /uninstalltunnelservice hta-vpn 2>$null',
    '  Start-Sleep -Seconds 2',
    '  $installOutput = (& $wireguard /installtunnelservice $conf 2>&1 | Out-String)',
    '  $installExit = $LASTEXITCODE',
    '  $serviceOutput = ""',
    '  $deadline = (Get-Date).AddSeconds(60)',
    '  do {',
    "    $serviceOutput = (sc.exe query 'WireGuardTunnel$hta-vpn' 2>&1 | Out-String)",
    '    if ($serviceOutput -match "RUNNING") {',
    '      Write-HtaResult $true "WireGuard tunnel service is running." $serviceOutput',
    '      exit 0',
    '    }',
    '    Start-Sleep -Seconds 2',
    '  } while ((Get-Date) -lt $deadline)',
    '  if ($serviceOutput -notmatch "RUNNING") {',
    '    Write-HtaResult $false "WireGuard tunnel service did not reach RUNNING before timeout." ("installExit=" + $installExit + "`n" + $installOutput + "`n" + $serviceOutput)',
    '    exit 1',
    '  }',
    '} catch {',
    '  Write-HtaResult $false "WireGuard tunnel installation failed." ($_.Exception.Message)',
    '  exit 1',
    '}',
    '',
  ].join('\r\n')

  fs.writeFileSync(scriptPath, script)

  const command = [
    '$argList = @(',
    "'-NoProfile',",
    "'-ExecutionPolicy', 'Bypass',",
    "'-WindowStyle', 'Hidden',",
    "'-File',",
    psQuote(scriptPath),
    ');',
    "Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -WindowStyle Hidden -Wait",
  ].join(' ')

  await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    timeout: 120000,
  })

  if (!fs.existsSync(resultPath)) {
    throw new Error('Windows admin approval is required to install the HTA VPN tunnel service.')
  }

  let result: { success?: boolean; message?: string; details?: string }
  try {
    const resultText = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim()
    result = JSON.parse(resultText)
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to read WireGuard tunnel installation result. ${details}`)
  }

  if (!result.success) {
    throw new Error(`${result.message || 'WireGuard tunnel installation failed'}${result.details ? ` ${result.details}` : ''}`)
  }
}

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

function readExistingPrivateKey(): string | null {
  try {
    if (!fs.existsSync(WG_CONF_PATH)) return null
    const match = fs.readFileSync(WG_CONF_PATH, 'utf8').match(/^PrivateKey\s*=\s*(.+)$/m)
    return match?.[1]?.trim() || null
  } catch {
    return null
  }
}

async function generateKeyPair(existingPrivateKey?: string | null): Promise<{ privateKey: string; publicKey: string }> {
  const { execSync } = require('child_process')

  const privateKey = existingPrivateKey || execSync(`"${WG_TOOL}" genkey`, { encoding: 'utf8' }).trim()

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

async function confirmProvisioningToken(apiBase: string, token: string, publicKey: string): Promise<void> {
  if (!/^HTA-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(token)) return

  try {
    const res = await makeRequest(`${apiBase}/api/vpn/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, publicKey }),
    })

    if (!res.ok) {
      const errorMsg = (res.data as { error?: string })?.error || `HTTP ${res.status}`
      console.warn('[vpn] Token confirmation failed:', errorMsg)
    }
  } catch (err) {
    console.warn('[vpn] Token confirmation request failed:', err)
  }
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
    // 1. Generate or reuse key pair. Reusing prevents server/client drift when
    // re-provision succeeds but elevated tunnel replacement fails or is cancelled.
    const existingPrivateKey = readExistingPrivateKey()
    console.log(existingPrivateKey ? '[vpn] Reusing existing key pair...' : '[vpn] Generating key pair...')
    const { privateKey, publicKey } = await generateKeyPair(existingPrivateKey)
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

    const wgConf = buildWgConf({
      privateKey,
      assignedIp: config.assignedIp,
      serverPublicKey: config.serverPublicKey,
      serverEndpoint: config.serverEndpoint,
      serverIp: config.serverIp,
    })

    // 3. Persist hta-vpn.conf in app data before the elevated install. If UAC
    // fails, the next repair attempt will reuse the same key the API now trusts.
    fs.mkdirSync(WG_CONF_DIR, { recursive: true })
    fs.writeFileSync(WG_CONF_PATH, wgConf, { mode: 0o600 })

    // 4. Uninstall existing tunnel (if any) then install fresh in an elevated
    // PowerShell process that writes a result file we can verify.
    console.log('[vpn] Installing tunnel service from:', WG_CONF_PATH)
    await installTunnelServiceElevated()
    console.log('[vpn] Tunnel service install completed')

    // Verify service exists and is running before marking the device provisioned.
    try {
      const { stdout } = await execFileAsync('sc', ['query', 'WireGuardTunnel$hta-vpn'])
      if (stdout.includes('RUNNING')) {
        console.log('[vpn] Tunnel service verified RUNNING')
      } else {
        console.warn('[vpn] Tunnel service not running after install')
        throw new Error('WireGuard tunnel service was installed but is not running. Approve the Windows admin prompt and try provisioning again.')
      }
    } catch (err) {
      console.error('[vpn] Tunnel service NOT FOUND after install')
      throw new Error(
        err instanceof Error && err.message.includes('WireGuard tunnel service')
          ? err.message
          : 'WireGuard is installed, but the HTA VPN tunnel service was not created. Approve the Windows admin prompt and try provisioning again.'
      )
    }

    // 6. Persist provisioned flag via Electron safeStorage (DPAPI-backed on Windows)
    await confirmProvisioningToken(apiBase, token, publicKey)

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
      await fetch(`${getPrivateApiBase()}/`, { signal: controller.signal })
      clearTimeout(timeout)
      connected = true
    } catch {
      connected = false
    }
  }

  return { configured, serviceRunning, connected, active: serviceRunning }
}
