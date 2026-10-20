@echo off
setlocal
set "DIR=%~dp0"
if defined JAVA_HOME goto checkMvn
if exist "C:\Program Files\Java\jdk-26.0.2" set "JAVA_HOME=C:\Program Files\Java\jdk-26.0.2"

:checkMvn
if exist "%DIR%apache-maven-3.9.9\bin\mvn.cmd" (
    "%DIR%apache-maven-3.9.9\bin\mvn.cmd" %*
) else (
    mvn %*
)
