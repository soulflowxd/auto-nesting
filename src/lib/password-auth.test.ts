import {afterEach,beforeEach,expect,it} from 'vitest';
import {randomBytes} from 'node:crypto';
import {POST as login} from '../../api/auth/login';
import {adminSession} from '../../server/auth';
import {hashAdminPassword,passwordAuthConfigured} from '../../server/password-auth';

const password='a-strong-test-password-123';
const origin='https://nesting.vercel.app';
const previous=Object.fromEntries(['ITKAN_ADMIN_EMAIL','ITKAN_ADMIN_USERNAME','ITKAN_ADMIN_PASSWORD_HASH','ITKAN_ADMIN_SESSION_SECRET'].map(key=>[key,process.env[key]]));

beforeEach(async()=>{
  process.env.ITKAN_ADMIN_EMAIL='admin@example.test';
  process.env.ITKAN_ADMIN_USERNAME='luqman';
  process.env.ITKAN_ADMIN_PASSWORD_HASH=await hashAdminPassword(password);
  process.env.ITKAN_ADMIN_SESSION_SECRET=randomBytes(32).toString('base64url');
});
afterEach(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

const request=(identifier:string,secret:string,requestOrigin=origin)=>new Request(`${origin}/api/auth/login`,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify({identifier,password:secret})});

it('accepts the configured email or username and issues a signed admin session',async()=>{
  expect(passwordAuthConfigured()).toBe(true);
  for(const identifier of ['admin@example.test','Luqman']){
    const response=await login(request(identifier,password));
    expect(response.status).toBe(200);
    const cookie=response.headers.get('Set-Cookie')??'';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(await adminSession(new Request(`${origin}/api/nest`,{headers:{Cookie:cookie.split(';')[0]}}))).toBe(true);
  }
});

it('rejects wrong credentials, cross-origin requests, and altered sessions',async()=>{
  expect((await login(request('luqman','incorrect-password'))).status).toBe(401);
  expect((await login(request('stranger',password))).status).toBe(401);
  expect((await login(request('luqman',password,'https://other.example'))).status).toBe(403);
  expect(await adminSession(new Request(`${origin}/api/nest`,{headers:{Cookie:'itkan_admin=invalid'}}))).toBe(false);
});
