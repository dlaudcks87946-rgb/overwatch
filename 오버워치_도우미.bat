@echo off
chcp 65001 > nul

:: 1. 현재 관리자 권한인지 확인 (아니면 관리자 권한으로 자기 자신을 재실행)
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: 2. 관리자 권한 획득 후 실제 프로젝트 폴더로 이동
cd /d "C:\Users\PC\꾀꼬리"
title OW2 실시간 조합 인식기 (관리자 권한)

echo [관리자 권한 확인 완료] 오버워치 2 실시간 조합 인식기를 시작합니다...
python recognizer.py
pause