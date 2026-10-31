@echo off
rem Starts STACKD (Node server + SQLite) at http://localhost:5173
rem First run: installs dependencies and seeds the demo database automatically.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22.13+ is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install --no-fund --no-audit
start "" http://localhost:5173
node server\main.js
