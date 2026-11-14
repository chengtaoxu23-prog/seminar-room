import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import GtmApp from './GtmApp';
import GtmRealWorkspace from './GtmRealWorkspace';
if(new URLSearchParams(location.search).get('legacy')==='1'){void import('./styles.css');void import('./workspace.css');}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(location.search).get('legacy') === '1' ? <App /> : new URLSearchParams(location.search).has('screen') ? <GtmApp /> : <GtmRealWorkspace />}
  </StrictMode>,
);
