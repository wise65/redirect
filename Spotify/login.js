// Add password toggle functionality
        document.querySelector('.sommer').addEventListener('click', function() {
            const passwordInput = document.getElementById('password');
            const eyeIcon = this.querySelector('.sneijder');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <line x1="1" y1="23" x2="23" y2="1"></line>
                `;
            } else {
                passwordInput.type = 'password';
                eyeIcon.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `;
            }
        });

        // Handle placeholder translations
        document.addEventListener('DOMContentLoaded', function() {
            const emailInput = document.getElementById('email');
            const passwordInput = document.getElementById('password');
            
            // Set initial placeholders
            const updatePlaceholders = () => {
                const currentLang = document.documentElement.lang || 'en';
                const translations = window.translations || {};
                
                if (translations[currentLang]) {
                    if (translations[currentLang]['email-placeholder']) {
                        emailInput.placeholder = translations[currentLang]['email-placeholder'];
                    }
                    if (translations[currentLang]['password-placeholder']) {
                        passwordInput.placeholder = translations[currentLang]['password-placeholder'];
                    }
                }
            };
            
            // Update placeholders after translation
            setTimeout(updatePlaceholders, 10);
        });