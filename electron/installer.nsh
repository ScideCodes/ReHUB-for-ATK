!include "FileFunc.nsh"

!macro customHeader
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
  DetailPrint "Removing application shortcuts and Windows uninstall registration."
  DetailPrint "Saved profiles and preferences are retained."
!macroend
