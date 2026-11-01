!include "FileFunc.nsh"
!include "nsDialogs.nsh"

!macro rehubValidateInstallDir
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  Push $R0
  Call RehubInstallDirectoryIsSafe
  Pop $R0
  ${If} $R0 != "1"
    MessageBox MB_OK|MB_ICONSTOP "Choose an empty folder named ${APP_FILENAME}. Setup will not install into a folder containing unrelated files." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!ifdef BUILD_UNINSTALLER
  Var rehubRemoveData
!endif

!macro customWelcomePage
  Var rehubUninstallChoice
  Var rehubInstalledPath
  Page custom rehubMaintenancePage rehubMaintenanceLeave

  Function rehubMaintenancePage
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "ReHUB Setup" "Install, update, or uninstall ReHUB for ATK."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateRadioButton} 0 10u 100% 18u "Install / update ReHUB for ATK"
    Pop $1
    ${NSD_Check} $1
    ${NSD_CreateRadioButton} 0 40u 100% 18u "Uninstall ReHUB for ATK"
    Pop $rehubUninstallChoice
    ReadRegStr $rehubInstalledPath SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $rehubInstalledPath == ""
    ${OrIfNot} ${FileExists} "$rehubInstalledPath\${APP_EXECUTABLE_FILENAME}"
      EnableWindow $rehubUninstallChoice 0
      ${NSD_CreateLabel} 0 65u 100% 30u "ReHUB is not installed for this account."
      Pop $0
    ${Else}
      ${NSD_CreateLabel} 0 65u 100% 40u "Installed in: $rehubInstalledPath$\r$\nUninstall lets you choose whether to keep saved profiles and settings."
      Pop $0
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function rehubMaintenanceLeave
    ${NSD_GetState} $rehubUninstallChoice $0
    ${If} $0 == ${BST_CHECKED}
      InitPluginsDir
      SetOutPath $PLUGINSDIR
      File "/oname=rehub-uninstall.exe" "${UNINSTALLER_OUT_FILE}"
      StrCpy $1 "/currentuser"
      ${If} $installMode == "all"
        StrCpy $1 "/allusers"
      ${EndIf}
      HideWindow
      ClearErrors
      ExecWait '"$PLUGINSDIR\rehub-uninstall.exe" $1 _?=$rehubInstalledPath' $0
      BringToFront
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "Could not start the uninstaller."
        Abort
      ${EndIf}
      ${If} $0 != 0
      ${OrIf} ${FileExists} "$rehubInstalledPath\${APP_EXECUTABLE_FILENAME}"
        Abort
      ${EndIf}
      Quit
    ${EndIf}
  FunctionEnd
!macroend

!macro customUnInit
  StrCpy $rehubRemoveData "0"
!macroend

!macro customUnWelcomePage
  Var rehubRemoveDataCheckbox
  UninstPage custom un.rehubOptions un.rehubOptionsLeave

  Function un.rehubOptions
    !insertmacro MUI_HEADER_TEXT "Uninstall ReHUB" "Choose what to remove, then click Next to uninstall."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 5u 100% 35u "ReHUB application files and shortcuts will be removed.$\r$\nDo you also want to delete saved profiles and settings?"
    Pop $0
    ${NSD_CreateCheckbox} 0 50u 100% 25u "Delete all ReHUB desktop profiles, settings and cached data"
    Pop $rehubRemoveDataCheckbox
    ${If} $rehubRemoveData == "1"
      ${NSD_Check} $rehubRemoveDataCheckbox
    ${EndIf}
    ${NSD_CreateLabel} 0 85u 100% 40u "Leave unchecked to keep your settings for a reinstall. Deleting them cannot be undone. Exported files and browser data are not removed."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.rehubOptionsLeave
    ${NSD_GetState} $rehubRemoveDataCheckbox $rehubRemoveData
  FunctionEnd
!macroend

!macro customHeader
  !include "${PROJECT_DIR}\electron\installer-safety.nsh"
  ShowInstDetails hide
  ShowUninstDetails hide
!macroend

!ifndef BUILD_UNINSTALLER
  Function RehubInstalledFile
    DetailPrint "Installed: $R9"
    Push ""
  FunctionEnd
!endif

!macro customInstall
  ; Keep a final inventory as well as the live extraction log.
  SetDetailsPrint both
  DetailPrint "Installed ReHUB application and bundled Electron runtime:"
  ${Locate} "$INSTDIR" "/L=F" "RehubInstalledFile"
  DetailPrint "Uninstaller: $INSTDIR\${UNINSTALL_FILENAME}"
  DetailPrint "Registered in Windows Settings > Apps > Installed apps."
  DetailPrint "Installation complete."
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "Removing ReHUB from $INSTDIR"
  ${IfNot} ${isUpdated}
    ; Electron uses the explicit AppUserModelID or its product-name fallback.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_ID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.${PRODUCT_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.${PRODUCT_NAME}"
  ${EndIf}
  DetailPrint "Removing application shortcuts and Windows uninstall registration."
  ${If} $rehubRemoveData == "1"
    DetailPrint "Removing saved desktop profiles, settings and cached data."
    ${IfNot} ${isUpdated}
      SetShellVarContext current
      ; Only this app's fixed cache directory is eligible for removal.
      ${If} $LOCALAPPDATA != ""
        RMDir /r "$LOCALAPPDATA\re-hub-for-atk-updater"
      ${EndIf}
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
    ${EndIf}
  ${Else}
    DetailPrint "Saved profiles and preferences are retained unless removal was requested on the command line."
  ${EndIf}
!macroend
