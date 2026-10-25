import {createHash,randomBytes} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {verifyPasswordSession} from './password-auth.js';

export const adminEmail=()=>process.env.ITKAN_ADMIN_EMAIL?.trim().toLowerCase();
const jwks=createRemoteJWKSet(new URL('https://vercel.com/.well-known/jwks'));
export const clientId=()=>process.env.VERCEL_OAUTH_CLIENT_ID;
export const clientSecret=()=>process.env.VERCEL_OAUTH_CLIENT_SECRET;
export const nonce=()=>randomBytes(32).toString('base64url');
export const challenge=(verifier:string)=>createHash('sha256').update(verifier).digest('base64url');
export const cookie=(name:string,value:string,maxAge:number)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const clearCookie=(name:string)=>cookie(name,'',0);
export function cookies(request:Request){return Object.fromEntries((request.headers.get('cookie')??'').split(';').map(item=>item.trim().split(/=(.*)/s).slice(0,2)).filter(([key])=>key).map(([key,value])=>[key,decodeURIComponent(value??'')]));}
export async function adminSession(request:Request){
  const token=cookies(request).itkan_admin;
  if(!token)return false;
  if(await verifyPasswordSession(token))return true;
  const id=clientId();
  const email=adminEmail();
  if(!id||!email)return false;
  try{
    const {payload}=await jwtVerify(token,jwks,{issuer:'https://vercel.com',audience:id});
    return typeof payload.email==='string'&&payload.email.toLowerCase()===email;
  }catch{return false;}
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !!origin&&origin===new URL(request.url).origin;}
