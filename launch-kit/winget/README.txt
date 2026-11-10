winget manifest TEMPLATE (3 files). Submit AFTER the release is stable.
Fill in: InstallerSha256 -> in PowerShell:  Get-FileHash .\HALO-Setup.exe -Algorithm SHA256
Check: InstallerUrl must point at that exact release file; the NSIS silent switch /S; Scope (machine because the installer asks for admin).
Validate:  winget validate --manifest .\winget
Test:      winget install --manifest .\winget
Submit:    fork github.com/microsoft/winget-pkgs, put the three files in manifests/e/ecch1369/HALO/<version>/, open a pull request
           (or use the helper:  winget install wingetcreate ; wingetcreate new <installer-url>).
Unsigned installers may be flagged during review - being open source and VirusTotal-clean helps. Template NOT tested.
