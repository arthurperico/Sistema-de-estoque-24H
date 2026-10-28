const LOCAL_SERVER_ORIGIN = 'http://localhost:3000';

function shouldRedirectToLocalServer() {
    if (window.location.protocol === 'file:') return true;

    const localHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
    const isLocalHost = localHosts.includes(window.location.hostname);
    const isKnownAppPort = ['3000', '8787'].includes(window.location.port);

    return isLocalHost && window.location.port && !isKnownAppPort;
}

if (shouldRedirectToLocalServer()) {
    window.location.replace(`${LOCAL_SERVER_ORIGIN}/`);
}

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        // Só redireciona se o servidor explicitamente disser que SIM, estamos logados
        if (data.authenticated === true) {
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        console.log('Sessão limpa, aguardando login.');
    }
}

async function login(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            window.location.href = '/dashboard.html';
        } else {
            alert('Usuário ou senha incorretos');
        }
    } catch (error) {
        alert('Erro ao conectar com o servidor');
    }
}

document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    login(u, p);
});

// Executa apenas uma vez ao abrir
document.addEventListener('DOMContentLoaded', checkAuth);
