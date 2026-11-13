import axios from 'axios';

const hostname = window.location.hostname;

const baseURL =
  hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : `http://${hostname}:5000/api`;

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

export default api;