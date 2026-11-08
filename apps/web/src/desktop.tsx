import React from 'react';
import ReactDOM from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createHashRouter,RouterProvider,Navigate,useSearchParams} from 'react-router-dom';
import {LocalShell} from './features/local-workbench/local-shell';
import {LocalConfigurations} from './features/local-workbench/local-configurations';
import {LocalAccountPage} from './features/local-workbench/local-account-page';
import {LocalTaskPage} from './features/local-workbench/local-task-page';
import {LocalHistory} from './features/local-workbench/local-history';
import {LocalAutomation} from './features/local-workbench/local-automation';
import {LocalReplyHistory,LocalPending,LocalNotices} from './features/local-workbench/local-record-pages';
import {LocalOverview,LocalInboxPage,LocalDataPage,LocalCapabilities} from './features/local-workbench/local-overview';
import './styles.css';
import './features/work/mist.css';
import './features/work/ui-consistency.css';
import './components/app-navigation/app-navigation.css';
import './features/work/simple.css';
import './design-system/foundation.css';
// Local-workbench page styles. These were previously pulled in by LocalShell;
// they are global, so the entry owns them now.
import './features/local-workbench/local-workbench.css';
import './features/local-workbench/local-shell.css';
// Theme must load last: foundation.css declares its own :root palette, and the
// slate tokens only win by source order. desktop-bridge.css then neutralises the
// graphite shell grid while keeping its descendant scopes.
import './styles/index.css';
import './styles/desktop-bridge.css';
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:10000}}});
function WorkRoute(){const [params]=useSearchParams();return params.get('module')==='accounts'?<LocalAccountPage/>:params.get('module')==='archive'?<LocalHistory key="runs" tab="runs"/>:params.get('module')==='notices'?<LocalNotices/>:<LocalOverview/>;}
function ContactRoute(){const [params]=useSearchParams();return params.get('view')==='pending'?<LocalPending/>:<><h1>自动回复与账号矩阵</h1><LocalAutomation/></>;}
const router=createHashRouter([{element:<LocalShell/>,children:[{path:'/work',element:<WorkRoute/>},{path:'/home',element:<LocalOverview/>},{path:'/automation',element:<LocalTaskPage/>},{path:'/configuration',element:<LocalConfigurations/>},{path:'/comment-review',element:<LocalHistory key="reviews" tab="reviews"/>},{path:'/reply-history',element:<LocalReplyHistory/>},{path:'/inbox',element:<LocalInboxPage/>},{path:'/auto-contact',element:<ContactRoute/>},{path:'/platforms',element:<LocalCapabilities/>},{path:'/data',element:<LocalDataPage/>},{path:'*',element:<Navigate to="/work" replace/>}]}]);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider></React.StrictMode>);
