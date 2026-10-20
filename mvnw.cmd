@echo off
setlocal
set "DIR=%~dp0"
if defined JAVA_HOME goto checkMvn
if exist "C:\Program Files\Java\jdk-26.0.2" set "JAVA_HOME=C:\Program Files\Java\jdk-26.0.2"
if exist "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot" set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"

:checkMvn
if exist "%DIR%apache-maven-3.9.9\bin\mvn.cmd" (
    "%DIR%apache-maven-3.9.9\bin\mvn.cmd" %*
) else (
    mvn %*
)
