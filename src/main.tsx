import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/overlay" element={<App overlayOnly />} />
        <Route path="/test" element={<App overlayOnly={false} />} />
        <Route path="*" element={<App overlayOnly />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
