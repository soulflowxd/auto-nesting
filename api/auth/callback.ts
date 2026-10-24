import {createRemoteJWKSet,jwtVerify} from 'jose';
import {adminEmail,clearCookie,clientId,clientSecret,cookie,cookies} from '../../server/auth.js';

export async function GET(request:Request){
  const url=new URL(request.url),saved=cookies(request),id=clientId(),secret=clientSecret();
  const headers=new Headers({'Cache-Control':'no-store'});
  for(const name of ['itkan_oauth_state','itkan_oauth_verifier','itkan_oauth_nonce'])headers.append('Set-Cookie',clearCookie(name));
  const fail=(message:string)=>new Response(message,{status:403,headers});
  const email=adminEmail();
  if(!id||!secret||!email)return fail('Admin sign-in is not configured.');
  if(!saved.itkan_oauth_state||url.searchParams.get('state')!==saved.itkan_oauth_state||!saved.itkan_oauth_verifier||!saved.itkan_oauth_nonce||!url.searchParams.get('code'))return fail('Sign-in session expired. Try again.');
  try{
    const body=new URLSearchParams({grant_type:'authorization_code',client_id:id,client_secret:secret,code:url.searchParams.get('code')!,code_verifier:saved.itkan_oauth_verifier,redirect_uri:new URL('/api/auth/callback',url.origin).href});
    const response=await fetch('https://api.vercel.com/login/oauth/token',{method:'POST',body});
    if(!response.ok)return fail('Vercel sign-in failed.');
    const data=await response.json() as {id_token?:string};
    if(!data.id_token)return fail('No identity token was returned.');
    const {payload}=await jwtVerify(data.id_token,createRemoteJWKSet(new URL('https://vercel.com/.well-known/jwks')),{issuer:'https://vercel.com',audience:id});
    if(payload.nonce!==saved.itkan_oauth_nonce||typeof payload.email!=='string'||payload.email.toLowerCase()!==email)return fail('This Vercel account is not an ITKAN Nest admin.');
    const lifetime=Math.max(0,Math.min(3600,(payload.exp??0)-Math.floor(Date.now()/1000)));
    if(!lifetime)return fail('The sign-in token expired.');
    headers.append('Set-Cookie',cookie('itkan_admin',data.id_token,lifetime));
    headers.set('Location','/');
    return new Response(null,{status:302,headers});
  }catch{return fail('Vercel sign-in could not be verified.');}
}
