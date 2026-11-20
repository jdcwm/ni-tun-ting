@echo off
REM ============================================================
REM  鲵吞亭 - 构建 Release APK
REM
REM  关键点：GRADLE_USER_HOME 指向项目内的 .gradle-home。
REM  原因：默认会去写 %USERPROFILE%\.gradle，在受限环境下会因
REM  无法获取文件锁而直接失败（gradle-*-bin.zip.lck 拒绝访问）。
REM  指到项目内既避开这个问题，也让缓存可随项目一起搬走。
REM
REM  如果 .gradle-home 里没有已解压的 gradle 发行版，第一次会联网下载；
REM  网络不通时可以从 %USERPROFILE%\.gradle\wrapper\dists 拷过来。
REM ============================================================

setlocal

set "PROJECT_DIR=%~dp0"
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
set "GRADLE_USER_HOME=%PROJECT_DIR%.gradle-home"
set "GRADLE_OPTS=-Dorg.gradle.daemon=false -Dkotlin.compiler.execution.strategy=in-process"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo ============================================
echo   Building Release APK
echo ============================================
echo   JAVA_HOME        = %JAVA_HOME%
echo   GRADLE_USER_HOME = %GRADLE_USER_HOME%
echo ============================================
echo.

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [ERROR] JDK not found at %JAVA_HOME%
  echo         请修改本脚本里的 JAVA_HOME
  pause
  exit /b 1
)

if not exist "%GRADLE_USER_HOME%" (
  echo [INFO] 创建项目内 Gradle 目录: %GRADLE_USER_HOME%
  mkdir "%GRADLE_USER_HOME%"
)

cd /d "%PROJECT_DIR%android"

call gradlew.bat assembleRelease --no-daemon --console=plain
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] 构建失败
  pause
  exit /b 1
)

set "APK=%PROJECT_DIR%android\app\build\outputs\apk\release\app-release.apk"
if exist "%APK%" (
  echo.
  echo [OK] 构建成功
  for %%A in ("%APK%") do echo      %%~fA  %%~zA bytes
) else (
  echo.
  echo [WARN] 未找到 app-release.apk，请检查上面的输出
)

endlocal
