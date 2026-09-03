// Check authentication status
async function checkAuth() {
    // Guest mode always takes priority - no server check needed
    if (localStorage.getItem('isGuestMode') === 'true') {
        window.location.href = '../';
        return;
    }

    try {
        const response = await fetch('../api/auth/status');
        const data = await response.json();
        
        if (data.authenticated === true) {
            window.location.href = '../';
        }
    } catch (error) {
        // Server not available - could be GitHub Pages
    }
}

// Returns a human-readable Portuguese string for a duration in seconds
function formatLockoutTime(seconds) {
    const YEAR = 365 * 24 * 3600;
    const MONTH = 30 * 24 * 3600;
    const WEEK = 7 * 24 * 3600;
    const DAY = 24 * 3600;
    const HOUR = 3600;
    const MIN = 60;
    if (seconds >= YEAR) {
        const n = Math.ceil(seconds / YEAR);
        return n === 1 ? '1 ano' : `${n} anos`;
    }
    if (seconds >= MONTH) {
        const n = Math.ceil(seconds / MONTH);
        return n === 1 ? '1 mês' : `${n} meses`;
    }
    if (seconds >= WEEK) {
        const n = Math.ceil(seconds / WEEK);
        return n === 1 ? '1 semana' : `${n} semanas`;
    }
    if (seconds >= DAY) {
        const n = Math.ceil(seconds / DAY);
        return n === 1 ? '1 dia' : `${n} dias`;
    }
    if (seconds >= HOUR) {
        const n = Math.ceil(seconds / HOUR);
        return n === 1 ? '1 hora' : `${n} horas`;
    }
    if (seconds >= MIN) {
        const n = Math.ceil(seconds / MIN);
        return n === 1 ? '1 minuto' : `${n} minutos`;
    }
    return `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
}

// Regular user login
async function login(username, password) {
    try {
        const response = await fetch('../api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            window.location.href = '../';
        } else {
            let msg = 'Usuário ou senha incorretos';
            try {
                const data = await response.json();
                if (data.remainingSeconds > 0) {
                    msg += ` — aguarde ${formatLockoutTime(data.remainingSeconds)}`;
                }
            } catch (_) { /* ignore parse error */ }
            showError(msg);
        }
    } catch (error) {
        showError('Erro ao conectar com o servidor. Tente o modo convidado.');
    }
}

// Guest login
async function guestLogin() {
    // Guest mode always uses localStorage (isolated from the real database)
    clearLocalDataExceptAppearance();
    localStorage.setItem('isGuestMode', 'true');
    window.location.href = '../';
}

function shouldPreserveAppearanceKey(key) {
    return key === 'appTheme'
        || key === 'custom-logo'
        || key === 'custom-favicon'
        || key.startsWith('theme-');
}

function clearLocalDataExceptAppearance() {
    try {
        Object.keys(localStorage).forEach((key) => {
            if (!shouldPreserveAppearanceKey(key)) {
                localStorage.removeItem(key);
            }
        });
        sessionStorage.clear();
    } catch (error) {
        console.error('Erro ao limpar dados locais:', error);
    }
}

function resetLocalBrowserData() {
    if (!confirm('Apagar os dados locais deste navegador para esta pagina?')) return;
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (error) {
        console.error('Erro ao resetar dados locais:', error);
    }
    window.location.reload();
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.textContent = message;
        setTimeout(() => errorEl.textContent = '', 5000);
    }
}

// Mode toggle (Login / Convidado)
document.addEventListener('DOMContentLoaded', function() {
    const btnLoginMode = document.getElementById('btn-login-mode');
    const btnGuestMode = document.getElementById('btn-guest-mode');
    const credentials = document.getElementById('credentials');
    const loginForm = document.getElementById('loginForm');
    const btnSubmit = document.getElementById('btn-submit');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const resetButton = document.getElementById('localDataResetButton');

    function setCredentialsRequired(isRequired) {
        if (usernameInput) usernameInput.required = isRequired;
        if (passwordInput) passwordInput.required = isRequired;
    }

    // Apply custom logo and favicon if set
    applyCustomLogoAndFavicon();
    
    // Apply theme colors from localStorage
    applyThemeColorsOnLogin();

    if (btnLoginMode) {
        btnLoginMode.addEventListener('click', function() {
            btnLoginMode.classList.add('active');
            btnGuestMode.classList.remove('active');
            credentials.style.display = '';
            btnSubmit.textContent = 'Entrar';
            setCredentialsRequired(true);
        });
    }

    if (btnGuestMode) {
        btnGuestMode.addEventListener('click', function() {
            btnGuestMode.classList.add('active');
            btnLoginMode.classList.remove('active');
            credentials.style.display = 'none';
            btnSubmit.textContent = 'Entrar como Convidado';
            setCredentialsRequired(false);
        });
    }

    // Handle form submission
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (btnGuestMode && btnGuestMode.classList.contains('active')) {
                guestLogin();
            } else {
                const u = document.getElementById('username').value;
                const p = document.getElementById('password').value;
                login(u, p);
            }
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', resetLocalBrowserData);
    }

    // Check if already authenticated
    checkAuth();
});

function applyThemeColorsOnLogin() {
    const primaryColor = localStorage.getItem('theme-primary-color') || '#ff3333';
    const secondaryColor = localStorage.getItem('theme-secondary-color') || '#cc0000';
    const bgStart = localStorage.getItem('theme-bg-start') || '#1a1a1a';
    const bgEnd = localStorage.getItem('theme-bg-end') || '#000000';
    
    // Apply colors to CSS variables
    document.documentElement.style.setProperty('--primary', primaryColor);
    document.documentElement.style.setProperty('--primary-2', secondaryColor);
    document.documentElement.style.setProperty('--primary-3', secondaryColor);
    document.documentElement.style.setProperty('--bg-start', bgStart);
    document.documentElement.style.setProperty('--bg-end', bgEnd);
}

function applyCustomLogoAndFavicon() {
    const customLogo = localStorage.getItem('custom-logo');
    const customFavicon = localStorage.getItem('custom-favicon');
    
    if (customLogo) {
        const logoImg = document.querySelector('.logo-image');
        if (logoImg) {
            logoImg.src = customLogo;
        }
    }
    
    // Update favicon - use custom if set, otherwise default favicon.webp
    if (customFavicon) {
        updateFaviconElement(customFavicon);
    }
}

// Shared utility function for updating favicon
function updateFaviconElement(logoData) {
    // Remove existing favicon links
    const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
    existingFavicons.forEach(link => link.remove());
    
    // Create new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/webp';
    link.href = logoData;
    document.head.appendChild(link);
}
