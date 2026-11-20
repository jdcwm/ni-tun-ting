@echo off
chcp 65001 >nul
title 鲵吞亭社区服务器

echo ========================================
echo   鲵吞亭社区服务器 启动脚本
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [信息] 检测到 Node.js 版本:
node --version
echo.

REM 切换到服务器目录
cd /d "%~dp0server"

REM 检查依赖是否已安装
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [信息] 依赖安装完成
    echo.
)

REM 创建必要目录
if not exist "E:\aitavern-data" mkdir "E:\aitavern-data"
if not exist "E:\aitavern-data\uploads" mkdir "E:\aitavern-data\uploads"
if not exist "E:\aitavern-data\posts" mkdir "E:\aitavern-data\posts"
if not exist "E:\aitavern-data\cards" mkdir "E:\aitavern-data\cards"

REM 获取本机局域网 IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set "LOCAL_IP=%%b"
    )
)

echo [信息] 正在启动服务器...
echo.
echo ========================================
echo   服务器地址: http://localhost:3000
if defined LOCAL_IP echo   局域网访问: http://%LOCAL_IP%:3000
echo   数据目录:  E:\aitavern-data
echo   按 Ctrl+C 停止服务器
echo ========================================
echo.

REM 启动服务器
node server.js
pause
