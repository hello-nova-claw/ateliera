import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/typography.css';

const root = document.querySelector('#root');

if (!root) {
  throw new Error('Ateliera root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
