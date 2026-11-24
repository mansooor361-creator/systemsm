; DaAIx custom NSIS include (added v1.6.43)
;
; Problem: Windows caches the uninstall entry size in
;   ...\App Management\ARPCache\<app key>\SlowInfoCache
; and keeps displaying the OLD size (e.g. 300 MB) even after a new
; version with a different real size is installed.
;
; Fix: delete the cache entry on every install so Windows re-measures
; the actually installed size of THIS version (electron-builder already
; writes a fresh EstimatedSize during this install).
!macro customInstall
  ClearErrors
  DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Management\ARPCache\${UNINSTALL_APP_KEY}"
  ClearErrors
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Management\ARPCache\${UNINSTALL_APP_KEY}"
  ClearErrors
!macroend
