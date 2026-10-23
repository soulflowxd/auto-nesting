import {expect,it} from 'vitest';
import {POST} from '../../api/nest';

it('does not run a server nest without verified admin sign-in',async()=>{
  const response=await POST(new Request('https://nesting.vercel.app/api/nest',{method:'POST',headers:{Origin:'https://nesting.vercel.app','Content-Type':'application/json'},body:'{}'}));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({error:'Admin sign-in required.'});
});
