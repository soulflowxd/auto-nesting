import {convexTest} from 'convex-test';
import {expect,it} from 'vitest';
import schema from './schema';
import {api} from './_generated/api';

const modules=import.meta.glob(['./**/*.ts','!./**/*.test.ts']);
const json=JSON.stringify({version:1,name:'Robot plates',parts:[],settings:{}});

it('requires authentication for listing and saving',async()=>{
  const t=convexTest(schema,modules);
  await expect(t.query(api.projects.list,{})).rejects.toThrow(/Sign in/);
  await expect(t.action(api.projects.saveCopy,{json})).rejects.toThrow(/Sign in/);
});
it('stores private project snapshots and enforces ownership on open and delete',async()=>{
  const t=convexTest(schema,modules);
  const [ownerId,otherId]=await t.run(async ctx=>Promise.all([ctx.db.insert('users',{email:'owner@example.test'}),ctx.db.insert('users',{email:'other@example.test'})]));
  const owner=t.withIdentity({subject:`${ownerId}|session`});
  const other=t.withIdentity({subject:`${otherId}|other-session`});
  const id=await owner.action(api.projects.saveCopy,{json});
  expect(await owner.query(api.projects.list,{})).toHaveLength(1);
  expect(JSON.parse(await owner.action(api.projects.open,{id}))).toEqual(JSON.parse(json));
  expect(await other.query(api.projects.list,{})).toEqual([]);
  await expect(other.action(api.projects.open,{id})).rejects.toThrow(/not found/);
  await expect(other.mutation(api.projects.remove,{id})).rejects.toThrow(/not found/);
  await owner.mutation(api.projects.remove,{id});
  expect(await owner.query(api.projects.list,{})).toEqual([]);
  await expect(owner.action(api.projects.open,{id})).rejects.toThrow(/not found/);
});
it('rejects malformed project data before creating stored files',async()=>{
  const t=convexTest(schema,modules);
  const id=await t.run(ctx=>ctx.db.insert('users',{email:'owner@example.test'}));
  const owner=t.withIdentity({subject:`${id}|session`});
  await expect(owner.action(api.projects.saveCopy,{json:'{}'})).rejects.toThrow(/supported/);
  expect(await owner.query(api.projects.list,{})).toEqual([]);
});
