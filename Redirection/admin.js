async function createLink() {
  const landingPage = document.getElementById("landingPage").value;

  const res = await fetch("/admin/create-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ landingPage })
  });

  const data = await res.json();
  if (data.url) {
    document.getElementById("result").innerHTML = 
      `✅ Link generated: <a href="${data.url}" target="_blank">${data.url}</a>`;
  } else {
    document.getElementById("result").textContent = "❌ Error generating link.";
  }
}
