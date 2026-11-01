; Return 1 only for a dedicated, empty/new app folder or the registered install.
; The caller pushes the registered installation path; the result replaces it.
!ifndef BUILD_UNINSTALLER
Function RehubInstallDirectoryIsSafe
  Exch $R3
  Push $R0
  Push $R1
  Push $R2
  Push $0
  Push $1
  StrCpy $R2 "0"
  ; Unlike NSIS GetFullPathName, Win32 also handles folders not yet created.
  System::Call 'kernel32::GetFullPathName(t "$INSTDIR", i ${NSIS_MAX_STRLEN}, t .r0, p 0) i .r1'
  ${If} $1 == 0
  ${OrIf} $1 >= ${NSIS_MAX_STRLEN}
    Goto rehubDirectoryDone
  ${EndIf}
  StrCpy $INSTDIR $0
  ${GetFileName} "$INSTDIR" $R0
  ${If} $R0 != "${APP_FILENAME}"
    Goto rehubDirectoryDone
  ${EndIf}
  ${If} $INSTDIR == "$PROFILE"
  ${OrIf} $INSTDIR == "$WINDIR"
  ${OrIf} $INSTDIR == "$SYSDIR"
  ${OrIf} $INSTDIR == "$PROGRAMFILES"
  ${OrIf} $INSTDIR == "$APPDATA"
  ${OrIf} $INSTDIR == "$LOCALAPPDATA"
  ${OrIf} $INSTDIR == "$DOCUMENTS"
  ${OrIf} $INSTDIR == "$DESKTOP"
  ${OrIf} $INSTDIR == "$TEMP"
    Goto rehubDirectoryDone
  ${EndIf}
  ${If} $R3 != ""
    GetFullPathName $R0 "$R3"
    ${If} $INSTDIR == $R0
    ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      StrCpy $R2 "1"
      Goto rehubDirectoryDone
    ${EndIf}
  ${EndIf}
  FindFirst $R0 $R1 "$INSTDIR\*"
  rehubDirectoryLoop:
    ${If} $R1 == ""
      StrCpy $R2 "1"
      Goto rehubDirectoryClosed
    ${EndIf}
    ${If} $R1 != "."
    ${AndIf} $R1 != ".."
      Goto rehubDirectoryClosed
    ${EndIf}
    FindNext $R0 $R1
    Goto rehubDirectoryLoop
  rehubDirectoryClosed:
    FindClose $R0
  rehubDirectoryDone:
    StrCpy $R3 $R2
    Pop $1
    Pop $0
    Pop $R2
    Pop $R1
    Pop $R0
    Exch $R3
FunctionEnd
!endif
