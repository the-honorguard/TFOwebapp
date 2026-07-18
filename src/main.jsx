// Entry point for the React application.
// Boots the React root and renders the top-level <App /> component.
// Keep this file minimal: imports here should be limited to global styles and the app root.
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './theme-tfo-adapter.css';
import './logClient';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
