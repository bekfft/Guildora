const params = new URLSearchParams(window.location.search);
document.querySelector('#target').textContent = params.get('target') || '';
document.querySelector('#retry').addEventListener('click', () => window.desktop.retry());
