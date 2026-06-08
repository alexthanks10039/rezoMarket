import { initApp } from './src/app.js?v=20260625';

initApp().catch((error) => {
  console.error('[app.init_error]', error);
  const appRoot = document.querySelector('#app');
  if (appRoot) {
    appRoot.innerHTML = `<div class="page-panel"><h2>Ошибка запуска приложения</h2><p>${error.message}</p></div>`;
  }
});
