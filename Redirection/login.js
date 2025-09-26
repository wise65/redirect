document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        // Clear previous messages
        errorMessage.textContent = '';
        errorMessage.classList.remove('show', 'error-message', 'success-message');
        
        // Basic validation
        if (!username || !password) {
            errorMessage.textContent = 'Please enter both username and password';
            errorMessage.classList.add('show', 'error-message');
            return;
        }
        
        // Set loading state
        loginBtn.disabled = true;
        loginBtn.classList.add('loading');
        
        try {
            // Send login request to server
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    // Login successful: start countdown
                    let countdown = 5;
                    errorMessage.textContent = `Login successful! Redirecting in ${countdown} seconds...`;
                    errorMessage.classList.add('show', 'success-message');

                    const countdownInterval = setInterval(() => {
                        countdown -= 1;
                        errorMessage.textContent = `Login successful! Redirecting in ${countdown} seconds...`;
                        if (countdown <= 0) {
                            clearInterval(countdownInterval);
                        }
                    }, 1000);

                    setTimeout(() => {
                        window.location.href = 'admin.html';
                    }, 5000);
                } else {
                    errorMessage.textContent = data.message || 'Invalid username or password';
                    errorMessage.classList.add('show', 'error-message');
                }
            } else {
                errorMessage.textContent = 'Invalid username or password';
                errorMessage.classList.add('show', 'error-message');
            }
            
        } catch (error) {
            console.error('Login error:', error);
            errorMessage.textContent = 'Connection error. Please try again.';
            errorMessage.classList.add('show', 'error-message');
        } finally {
            // Reset button
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading');
        }
    });
    
    // Focus on username input
    usernameInput.focus();
});