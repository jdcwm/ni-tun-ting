@echo off
chcp 65001 >nul
title 鲵吞亭服务器 - 一键部署
setlocal EnableDelayedExpansion

REM =====================================================
REM   鲵吞亭社区后端服务器 - Windows 一键部署脚本
REM   用法：双击本文件，或在 cmd 中运行 deploy.bat
REM   可配置项（可选，通过环境变量覆盖）：
REM     PORT          服务端口，默认 3000
REM     DATA_DIR      数据目录，默认 本目录\data
REM     ADMIN_USERNAME 管理员账号，默认 jdcwm
REM     ADMIN_PASSWORD 管理员密码（必填，不再提供默认值）
REM =====================================================

if "%PORT%"=="" set "PORT=3000"
if "%DATA_DIR%"=="" set "DATA_DIR=%~dp0data"
if "%ADMIN_USERNAME%"=="" set "ADMIN_USERNAME=jdcwm"
if "%ADMIN_PASSWORD%"=="" (
  echo [错误] 请先设置管理员密码: set ADMIN_PASSWORD=你的密码
  exit /b 1
)

echo ============================================
echo   鲵吞亭服务器 - 一键部署 (Windows)
echo ============================================
echo   端口:   %PORT%
echo   数据目录: %DATA_DIR%
echo.

REM ---------- 1. Node.js 检查 ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js
  echo        请先安装 Node.js 18 或更高版本：
  echo        https://nodejs.org/
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [1/5] Node.js 已安装: !NODE_VER!
echo.

REM ---------- 2. 安装依赖 ----------
if not exist "%~dp0node_modules" (
  echo [2/5] 首次运行，正在安装依赖 (npm install)...
  cd /d "%~dp0"
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败，请检查网络后重试
    pause
    exit /b 1
  )
  echo [OK] 依赖安装完成
) else (
  echo [2/5] 依赖已存在，跳过安装
)
echo.

REM ---------- 3. 初始化管理员 ----------
echo [3/5] 初始化管理员账号...
cd /d "%~dp0"
node setup-admin.js
if errorlevel 1 (
  echo [错误] 管理员初始化失败
  pause
  exit /b 1
)
echo.

REM ---------- 4. 开放防火墙端口 ----------
echo [4/5] 尝试放行防火墙端口 %PORT% (需管理员权限)...
netsh advfirewall firewall add rule name="鲵吞亭服务器 %PORT%" dir=in action=allow protocol=TCP localport=%PORT% >nul 2>nul
if errorlevel 1 (
  echo [提示] 防火墙放行失败（可能未以管理员运行）。
  echo        请手动在「Windows 防火墙 → 高级设置 → 入站规则」放行 TCP %PORT% 端口。
) else (
  echo [OK] 防火墙端口 %PORT% 已放行
)
echo.

REM ---------- 5. 启动服务器 ----------
echo [5/5] 启动服务器...
cd /d "%~dp0"
start "鲵吞亭服务器 :%PORT%" cmd /k "cd /d %~dp0 & set PORT=%PORT% & set DATA_DIR=%DATA_DIR% & node server.js"

timeout /t 3 /nobreak >nul

REM 检测局域网 IP
set "LAN_IP=127.0.0.1"
for /f "delims=" %%a in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '127.*' } ^| Select-Object -First 1 -ExpandProperty IPAddress)" 2^>nul') do set "LAN_IP=%%a"

echo.
echo ============================================
echo   部署完成！
echo ============================================
echo   本机访问:   http://127.0.0.1:%PORT%
echo   局域网访问: http://!LAN_IP!:%PORT%
echo   数据目录:   %DATA_DIR%
echo   管理员账号: %ADMIN_USERNAME%
echo.
echo   在手机 app 里：左菜单 → 服务器 → 填入上述地址。
echo   外网访问请在云平台安全组/路由器放行 %PORT% 端口。
echo.
pause
endlocal
