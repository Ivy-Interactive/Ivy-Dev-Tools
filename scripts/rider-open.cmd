@echo off
setlocal EnableDelayedExpansion
set "RAW=%~1"
set "RAW=!RAW:rider-open://=!"
rem Decode common URL encodings
set "RAW=!RAW:%%20= !"
set "RAW=!RAW:%%3A=:!"
rem Remove trailing slash
if "!RAW:~-1!"=="/" set "RAW=!RAW:~0,-1!"
rem Split on last colon (line number)
for /f "tokens=1* delims=?" %%a in ("!RAW!") do set "FILEPATH=%%a" & set "PARAMS=%%b"
rem Extract line from query params or from path:line format
set "LINE="
if defined PARAMS (
    for /f "tokens=1,2 delims=&" %%x in ("!PARAMS!") do (
        for /f "tokens=1,2 delims==" %%m in ("%%x") do (
            if "%%m"=="line" set "LINE=%%n"
        )
    )
)
if defined LINE (
    "C:\Program Files\JetBrains\JetBrains Rider 2025.3.3\bin\rider64.exe" --line !LINE! "!FILEPATH!"
) else (
    "C:\Program Files\JetBrains\JetBrains Rider 2025.3.3\bin\rider64.exe" "!FILEPATH!"
)
