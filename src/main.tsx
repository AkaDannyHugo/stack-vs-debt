import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { inject } from '@vercel/analytics';
import { ON_VERCEL } from './analytics';
// Privacy-friendly page counts (no cookies). Only loaded when hosted on Vercel; a no-op elsewhere (e.g. GitHub Pages).
if (ON_VERCEL) inject();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
