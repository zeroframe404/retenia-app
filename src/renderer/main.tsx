import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { texts } from '../preload/contract/texts';
import { App } from './App';
import './tokens.css';

document.title = texts.appName;

const root = document.getElementById('raiz');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
