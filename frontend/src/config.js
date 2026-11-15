// Centralized API configuration.
//
// VITE_API_BASE_URL is set at build time via Cloudflare env var:
//   Production  → https://ask-attendance-api.onrender.com/api
//   Local dev   → (not set) → falls back to http://localhost:5000/api

const explicitBase = import.meta.env.VITE_API_BASE_URL;

export const API_BASE = explicitBase
  ? explicitBase.replace(/\/+$/, '')
  : 'http://localhost:5000/api';

export const API_ORIGIN = API_BASE.replace(/\/api$/, '');

// Alias for existing imports
export const API_BASE_URL = API_BASE;