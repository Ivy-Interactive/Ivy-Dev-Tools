@echo off
:: Native messaging host for Ivy Dev Tools.
:: Reads JSON messages from Chrome via stdin, launches IDE to open files.
:: Protocol: Chrome sends 4-byte little-endian length prefix + JSON body.
:: We use PowerShell to parse since batch can't handle binary/JSON natively.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ivy-file-opener.ps1"
