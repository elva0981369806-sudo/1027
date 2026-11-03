@echo off
title F1 Racing Simulator - Rookie Simcade
echo ========================================================
echo     🏎️ F1 賽車模擬器 (新手超友善版) 正在啟動...
echo ========================================================
echo.
echo 正在開啟本機伺服器並載入遊戲...
echo.

start "" "http://localhost:8080/index.html"
python -m http.server 8080

pause

