import {challenge,clientId,cookie,nonce} from '../../server/auth.js';

export function GET(request:Request){
  const id=clientId();
  if(!id)return Response.json({error:'Admin sign-in is not configured.'},{status:503});
  const state=nonce(),verifier=nonce()+nonce(),loginNonce=nonce();
  const redirect=new URL('/api/auth/callback',request.url);
  const url=new URL('https://vercel.com/oauth/authorize');
  for(const [key,value] of Object.entries({client_id:id,redirect_uri:redirect.href,state,nonce:loginNonce,code_challenge:challenge(verifier),code_challenge_method:'S256',response_type:'code',scope:'openid email'}))url.searchParams.set(key,value);
  const headers=new Headers({Location:url.href,'Cache-Control':'no-store'});
  headers.append('Set-Cookie',cookie('itkan_oauth_state',state,600));
  headers.append('Set-Cookie',cookie('itkan_oauth_verifier',verifier,600));
  headers.append('Set-Cookie',cookie('itkan_oauth_nonce',loginNonce,600));
  return new Response(null,{status:302,headers});
}
