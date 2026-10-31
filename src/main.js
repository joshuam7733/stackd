import { html, render } from './lib/preact.js';
import { App } from './ui/app.js';
import { installInteractions } from './ui/interactions.js';
import { installFit } from './ui/fit.js';

installInteractions();
const root = document.getElementById('app');
root.textContent = '';
render(html`<${App} />`, root);
installFit();
