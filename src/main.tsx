import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import '@fontsource-variable/geist';
import './index.css';
import App from './App';

const url=import.meta.env.VITE_CONVEX_URL as string|undefined;
const client=url?new ConvexReactClient(url):null;
createRoot(document.getElementById('root')!).render(<StrictMode>{client?<ConvexAuthProvider client={client}><App/></ConvexAuthProvider>:<App/>}</StrictMode>);
