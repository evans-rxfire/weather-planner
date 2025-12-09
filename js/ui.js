// Dark Mode Toggle
const darkModeBtn = document.getElementById('dark-mode-toggle');
const htmlElement = document.documentElement;

if (darkModeBtn) {
  darkModeBtn.addEventListener('click', () => {
    htmlElement.classList.toggle('dark');
    localStorage.setItem('theme', htmlElement.classList.contains('dark') ? 'dark' : 'light');
  });

  window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      htmlElement.classList.add('dark');
    }
  });
}

// Dropdown Toggle
const dropdownBtn = document.getElementById('dropdown-toggle');
const dropdownMenu = document.getElementById('dropdown-menu');

if (dropdownBtn && dropdownMenu) {
  dropdownBtn.addEventListener('click', () => {
    // console.log('Dropdown button clicked'); // ✅ Logs when button is clicked
    dropdownMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    setTimeout(() => {
      if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
        // console.log('Clicked outside dropdown'); // ✅ Logs when clicked elsewhere
        dropdownMenu.classList.add('hidden');
      }
    }, 10);
  });
}

// App installation
let deferredPrompt;
const installBtn = document.getElementById("install-button");


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((reg) => debugLog("Service Worker registered:", reg.scope))
      .catch((err) => debugLog("Service Worker registration failed:", err));
  });
}

// App install language
installBtn?.classList.add("hidden");


window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    installBtn?.classList.remove("hidden");
});


installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;
    debugLog("User choice:", outcome);

    deferredPrompt = null;
    installBtn?.classList.add("hidden");
});


window.addEventListener("appinstalled", () => {
    debugLog("✅ App installed");
    deferredPrompt = null;
    installBtn?.classList.add("hidden");
});
