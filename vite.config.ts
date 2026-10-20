import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// BASE_PATH lets the same code build for GitHub Pages (/stack-vs-debt/) or a root domain (/).
export default defineConfig({ base: process.env.BASE_PATH ?? '/stack-vs-debt/', plugins: [react()] });
