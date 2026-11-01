; NexNotes — per-user Windows installer (NSIS 3)
;
; Built by the release workflow on windows-latest:
;   makensis -DVERSION=x.y.z -DSRCDIR=<extracted zip> -DOUTFILE=<path> scripts/installer.nsi
;
; Design notes:
;   - RequestExecutionLevel user  → installs to %LOCALAPPDATA%, no UAC prompt,
;     and the silent install in CI works without elevation.
;   - The package already carries bin\node.exe, so the installed app is
;     self-contained; nexnotes.cmd prefers it over any system Node.
;   - Data (SQLite + auth secret) lives in %LOCALAPPDATA%\NexNotes\data,
;     created on first launch by nexnotes.cmd — upgrading never touches data.

!include "MUI2.nsh"

!define APPNAME "NexNotes"
!define COMPANY "NexNotes"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\NexNotes"

Name "${APPNAME} ${VERSION}"
OutFile "${OUTFILE}"
Unicode true
RequestExecutionLevel user
ShowInstDetails show
ShowUnInstDetails show

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "NexNotes (required)"
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"

  ; launcher shortcut in the Start Menu
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" \
    "$INSTDIR\nexnotes.cmd" "" "$INSTDIR\nexnotes.png" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" \
    "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APPNAME} ${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  ; data dir (%LOCALAPPDATA%\NexNotes) is intentionally preserved
  RMDir /r "$INSTDIR"
  RMDir "$SMPROGRAMS\${APPNAME}"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
