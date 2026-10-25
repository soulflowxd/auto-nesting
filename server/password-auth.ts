import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
const adminEmail=()=>process.env.ITKAN_ADMIN_EMAIL?.trim().toLowerCase();

const derive=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,workFactor,(error,key)=>error?reject(error):resolve(key)));
const issuer='itkan-nest';
const audience='itkan-admin';
const sessionHours=8;
const workFactor={N:32768,r:8,p:1,maxmem:64*1024*1024};

function verifier(){
  const value=process.env.ITKAN_ADMIN_PASSWORD_HASH?.trim()??'';
  const match=/^scrypt\$([A-Za-z0-9_-]{22,})\$([A-Za-z0-9_-]{86,})$/.exec(value);
  if(!match)return null;
  const salt=Buffer.from(match[1],'base64url');
  const hash=Buffer.from(match[2],'base64url');
  return salt.length>=16&&hash.length===64?{salt,hash}:null;
}

function sessionKey(){
  const value=process.env.ITKAN_ADMIN_SESSION_SECRET?.trim()??'';
  if(!/^[A-Za-z0-9_-]{43,}$/.test(value))return null;
  const key=Buffer.from(value,'base64url');
  return key.length>=32?key:null;
}

export function passwordAuthConfigured(){return !!adminEmail()&&!!verifier()&&!!sessionKey();}

export function adminUsername(){return process.env.ITKAN_ADMIN_USERNAME?.trim().toLowerCase()||undefined;}

export async function passwordMatches(identifier:string,password:string){
  const stored=verifier(),email=adminEmail();
  if(!stored||!email||!password||password.length>256)return false;
  const calculated=await derive(password,stored.salt);
  const identity=identifier.trim().toLowerCase();
  return timingSafeEqual(calculated,stored.hash)&&(identity===email||identity===adminUsername());
}

export async function hashAdminPassword(password:string){
  if(password.length<16||password.length>256)throw new Error('Use a password between 16 and 256 characters.');
  const salt=randomBytes(24);
  const hash=await derive(password,salt);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function newPasswordSession(){
  const key=sessionKey(),email=adminEmail();
  if(!key||!email)throw new Error('Admin sign-in is not configured.');
  return new SignJWT({role:'admin'}).setProtectedHeader({alg:'HS256'}).setSubject(email)
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(`${sessionHours}h`).sign(key);
}

export async function verifyPasswordSession(token:string){
  const key=sessionKey(),email=adminEmail();
  if(!key||!email)return false;
  try{
    const {payload}=await jwtVerify(token,key,{issuer,audience,algorithms:['HS256']});
    return payload.sub===email&&payload.role==='admin';
  }catch{return false;}
}

export const passwordSessionSeconds=sessionHours*60*60;
