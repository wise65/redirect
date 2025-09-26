
async function createLink() {
  const landingPage = document.getElementById("landingPage").value;

  const res = await fetch("/admin/create-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ landingPage })
  });

  const data = await res.json();
  if (data.url) {
    //const randomEmail = generateRandomEmail();
    // const urlWithEmail = `${data.url}?email=${encodeURIComponent(randomEmail)}`; 
    const urlWithEmail = data.url; 
    document.getElementById("result").innerHTML = 
      `✅ Link generated: <a href="${urlWithEmail}" target="_blank">${urlWithEmail}</a>`;
  } else {
    document.getElementById("result").textContent = "❌ Error generating link.";
  }
}


function generateRandomEmail() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const randomStr = Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
  return `${randomStr}@mailnet.com`;
}
