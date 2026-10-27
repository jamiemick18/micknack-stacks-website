@echo off
rem Opens the Micknack Stacks HUB. Double-click this file; close the window when done.
cd /d "%~dp0"
start "" http://localhost:5174
node scripts/shop.js
pause
