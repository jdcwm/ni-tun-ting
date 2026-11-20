@echo off
chcp 65001 >nul
title 停止鲵吞亭社区服务器

echo 正在停止服务器...
taskkill /f /im node.exe 2>nul
if %errorlevel% equ 0 (
    echo 服务器已停止
) else (
    echo 没有正在运行的服务器
)
timeout /t 2 >nul
