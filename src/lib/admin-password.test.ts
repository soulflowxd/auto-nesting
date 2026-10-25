import {afterEach,expect,it,vi} from 'vitest';
import {put} from '@vercel/blob';
import {POST} from '../../api/auth/password';
import {saveAdminPassword} from '../../server/password-auth';

vi.mock('@vercel/blob',()=>({get:vi.fn(),put:vi.fn()}));
const priorToken=process.env.BLOB_READ_WRITE_TOKEN;
afterEach(()=>{vi.clearAllMocks();if(priorToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=priorToken;});

it('requires an OAuth admin session before accepting a password',async()=>{
  const request=new Request('https://nesting.vercel.app/api/auth/password',{method:'POST',headers:{Origin:'https://nesting.vercel.app','Content-Type':'application/json'},body:JSON.stringify({password:'test-password-123'})});
  expect((await POST(request)).status).toBe(403);
  expect(put).not.toHaveBeenCalled();
});

it('saves only a salted verifier in private storage',async()=>{
  process.env.BLOB_READ_WRITE_TOKEN='test-token';
  await saveAdminPassword('test-password-123');
  expect(put).toHaveBeenCalledOnce();
  const [pathname,body,options]=vi.mocked(put).mock.calls[0];
  expect(pathname).toBe('auth/admin-password.txt');
  expect(body).toMatch(/^scrypt\$/);
  expect(body).not.toContain('test-password-123');
  expect(options).toMatchObject({access:'private',allowOverwrite:true});
});
