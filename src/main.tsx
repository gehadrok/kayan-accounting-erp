import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { installAuthenticatedFetch } from './utils/authenticatedFetch';
import './index.css';

installAuthenticatedFetch();

createRoot(document.getElementById('root')!).render(<App />);
