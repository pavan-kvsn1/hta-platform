; installer-extras.nsh
; Included by electron-builder NSIS installer via the `include` option.
; This file runs additional steps during installation.

; Install WireGuard before app files. The MSI build wraps this NSIS installer,
; so WireGuard still ships inside the single HTA Desktop MSI artifact.
!macro customInstall
  DetailPrint "Installing WireGuard VPN..."

  InitPluginsDir
  File /oname=$PLUGINSDIR\wireguard-installer.exe "${PROJECT_DIR}\resources\wireguard-installer.exe"
  StrCpy $0 "$PLUGINSDIR\wireguard-installer.exe"

  IfFileExists "$0" wg_found wg_missing

  wg_found:
    ExecWait '"$0" /quiet /norestart' $1
    DetailPrint "WireGuard installer exit code: $1"
    Goto wg_done

  wg_missing:
    DetailPrint "WireGuard installer not found at $0 - skipping (may already be installed)"

  wg_done:
!macroend

; WireGuard is a shared system component - leave it installed on uninstall.
!macro customUnInstall
!macroend
