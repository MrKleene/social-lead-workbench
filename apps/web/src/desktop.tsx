import React from 'react';
import ReactDOM from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LocalWorkbench} from './features/local-workbench/local-workbench';
import './styles.css';
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:10000}}});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><LocalWorkbench/></QueryClientProvider></React.StrictMode>);
