@echo off
REM Inicia o servidor local e abre o navegador no Windows.
REM Execute este arquivo com duplo clique.

cd /d "%~dp0"
set "PORT=3000"
set "URL=http://localhost:%PORT%"

echo Verificando Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo Erro: Node.js nao foi encontrado no PATH.
    echo Instale o Node.js e tente novamente.
    pause
    exit /b 1
)

echo Verificando npm...
where npm >nul 2>&1
if errorlevel 1 (
    echo Erro: npm nao foi encontrado no PATH.
    echo Instale o Node.js e tente novamente.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    echo Dependencias nao encontradas. Instalando npm...
    npm install
    if errorlevel 1 (
        echo Falha ao instalar dependencias. Verifique o npm e tente novamente.
        pause
        exit /b 1
    )
)

echo Verificando se a porta %PORT% ja esta em uso...
netstat -ano | findstr /i "LISTENING" | findstr /c":%PORT%" >nul 2>&1
if %errorlevel%==0 (
    echo Porta %PORT% ja esta em uso. Verifique se o servidor ja esta rodando.
    echo Abrindo o navegador em %URL%...
    start "" "%URL%"
    exit /b 0
)

echo Iniciando servidor em uma nova janela...
start "Servidor 24h" cmd /k "cd /d %~dp0 && npm run dev"

echo Aguardando o servidor iniciar...
set "TRIES=0"
:WAIT_FOR_PORT
if %TRIES% geq 20 goto PORT_TIMEOUT
netstat -ano | findstr /i "LISTENING" | findstr /c":%PORT%" >nul 2>&1
if %errorlevel%==0 goto PORT_READY
timeout /t 1 /nobreak >nul
set /a TRIES+=1
goto WAIT_FOR_PORT

:PORT_READY
echo Servidor detectado na porta %PORT%.
echo Abrindo %URL% no navegador...
start "" "%URL%"
echo.
echo Se o navegador nao abrir automaticamente, acesse:
echo %URL%
echo.
exit /b 0

:PORT_TIMEOUT
echo Nao foi possivel detectar o servidor na porta %PORT% em 20 segundos.
echo Verifique se o Node esta iniciando corretamente.
echo Abrindo %URL% de qualquer forma...
start "" "%URL%"
echo.
echo Se o navegador nao abrir automaticamente, acesse:
echo %URL%
echo.
exit /b 1
