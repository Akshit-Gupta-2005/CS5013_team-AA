@echo off
setlocal
if exist "%LOCALAPPDATA%\doxygen\doxygen.exe" (
    "%LOCALAPPDATA%\doxygen\doxygen.exe" %*
) else (
    doxygen %*
)
