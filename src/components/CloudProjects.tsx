import {useState} from 'react';
import {useAuthActions} from '@convex-dev/auth/react';
import {useAction,useConvexAuth,useMutation,useQuery} from 'convex/react';
import {Cloud,LogOut,Save,Trash2,X,FolderOpen,LoaderCircle} from 'lucide-react';
import {api} from '../../convex/_generated/api';
import type {Id} from '../../convex/_generated/dataModel';
import {currentJob,useJobStore} from '../stores/job-store';
import {parseJob} from '../lib/job';

export function CloudProjects({onClose}:{onClose:()=>void}) {
  return <div className="modal-backdrop" onClick={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="cloud-title" onClick={e=>e.stopPropagation()}><div className="modal-heading"><h2 id="cloud-title"><Cloud size={19} style={{display:'inline',marginRight:8}}/>Cloud projects</h2><button className="icon-button" aria-label="Close cloud projects" onClick={onClose}><X size={18}/></button></div>{import.meta.env.VITE_CONVEX_URL?<ConnectedProjects onClose={onClose}/>:<><p>The local CAD workspace is ready to use. Connect a separate Convex project to save private snapshots across devices.</p><pre className="cloud-config">bun run convex:dev<br/>bunx @convex-dev/auth</pre><p className="field-hint">Set VITE_CONVEX_URL in .env.local and follow the Convex Auth setup in README.md. Use Save job to download a project file in the meantime.</p></>}</section></div>;
}

function ConnectedProjects({onClose}:{onClose:()=>void}) {
  const {isAuthenticated,isLoading}=useConvexAuth();
  if(isLoading)return <p>Connecting…</p>;
  return isAuthenticated?<ProjectList onClose={onClose}/>:<SignIn/>;
}
function SignIn() {
  const {signIn}=useAuthActions();
  const [signup,setSignup]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  return <><p>Sign in to save and reopen your own nesting projects.</p><form className="cloud-form" onSubmit={async e=>{
    e.preventDefault();setPending(true);setError('');const form=new FormData(e.currentTarget);form.set('flow',signup?'signUp':'signIn');
    try {await signIn('password',form);}catch(e){setError(e instanceof Error?e.message:'Sign-in failed.');}finally{setPending(false);}
  }}><label>Email<input name="email" type="email" autoComplete="email" required disabled={pending}/></label><label>Password<input name="password" type="password" autoComplete={signup?'new-password':'current-password'} minLength={8} maxLength={128} required disabled={pending}/></label>{error&&<div role="alert" className="error-message">{error}</div>}<button className="primary-button" disabled={pending}>{pending?<LoaderCircle size={16} className="spin"/>:null}{signup?'Create account':'Sign in'}</button><button type="button" className="text-button" disabled={pending} onClick={()=>{setSignup(!signup);setError('');}}>{signup?'Already have an account? Sign in':'Need an account? Create one'}</button></form></>;
}
function ProjectList({onClose}:{onClose:()=>void}) {
  const projects=useQuery(api.projects.list,{});
  const save=useAction(api.projects.saveCopy);
  const open=useAction(api.projects.open);
  const remove=useMutation(api.projects.remove);
  const {signOut}=useAuthActions();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [deleteId,setDeleteId]=useState<Id<'projects'>|null>(null);
  const [openId,setOpenId]=useState<Id<'projects'>|null>(null);
  const name=useJobStore(s=>s.name);
  async function action(fn:()=>Promise<unknown>) {
    setBusy(true);setError('');setMessage('');
    try {await fn();}catch(e){setError(e instanceof Error?e.message:'Cloud operation failed.');}finally{setBusy(false);}
  }
  async function openProject(id:Id<'projects'>) {await action(async()=>{const json=await open({id});useJobStore.getState().loadJob(parseJob(json));onClose();});}
  return <><p>Each save creates a new private snapshot. Saved layouts are recalculated when opened.</p><button className="primary-button" disabled={busy||!name.trim()} onClick={()=>void action(async()=>{await save({json:JSON.stringify(currentJob())});setMessage('Snapshot saved to Convex.');})}><Save size={15}/>Save a copy of current job</button>{message&&<div className="cloud-notice" role="status">{message}</div>}{error&&<div className="error-message" role="alert">{error}</div>}
    {openId&&<div className="cloud-notice">Opening replaces the current job. Save your current work first.<div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={()=>setOpenId(null)}>Keep current job</button><button className="primary-button" disabled={busy} onClick={()=>void openProject(openId)}>Open snapshot</button></div></div>}
    {deleteId&&<div className="cloud-notice">Delete this cloud snapshot?<div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={()=>setDeleteId(null)}>Keep it</button><button className="primary-button" disabled={busy} onClick={()=>void action(async()=>{await remove({id:deleteId});setDeleteId(null);})}>Delete snapshot</button></div></div>}
    <div className="cloud-project-list">{projects===undefined?<p>Loading projects…</p>:!projects.length?<p>No saved projects yet.</p>:projects.map(p=><div key={p._id} className="cloud-project-row"><div><strong>{p.name}</strong><span>{new Date(p.savedAt).toLocaleString()}</span></div><button className="icon-button" aria-label={`Open ${p.name}`} disabled={busy} onClick={()=>setOpenId(p._id)}><FolderOpen size={16}/></button><button className="icon-button" aria-label={`Delete ${p.name}`} disabled={busy} onClick={()=>setDeleteId(p._id)}><Trash2 size={15}/></button></div>)}</div><div className="modal-actions"><button className="text-button" disabled={busy} onClick={()=>void action(async()=>{await signOut();})}><LogOut size={14}/>Sign out</button></div></>;
}
