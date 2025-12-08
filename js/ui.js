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
    console.log('Dropdown button clicked'); // ✅ Logs when button is clicked
    dropdownMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    setTimeout(() => {
      if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
        console.log('Clicked outside dropdown'); // ✅ Logs when clicked elsewhere
        dropdownMenu.classList.add('hidden');
      }
    }, 10);
  });
}
