import {v,ConvexError} from 'convex/values';
import {getAuthUserId} from '@convex-dev/auth/server';
import {query,mutation,action,internalQuery,internalMutation,type QueryCtx,type MutationCtx,type ActionCtx} from './_generated/server';
import {internal} from './_generated/api';
import type {Doc,Id} from './_generated/dataModel';
import {parseJob} from '../src/lib/job';

async function requireUser(ctx:QueryCtx|MutationCtx|ActionCtx) {
  const id=await getAuthUserId(ctx);
  if(!id)throw new ConvexError('Sign in to use cloud projects.');
  return id;
}
async function owned(ctx:QueryCtx|MutationCtx,id:Id<'projects'>) {
  const user=await requireUser(ctx);
  const project=await ctx.db.get(id);
  if(!project||project.ownerId!==user)throw new ConvexError('Project not found.');
  return project;
}

export const list=query({args:{},handler:async ctx=>{
  const user=await requireUser(ctx);
  const projects=await ctx.db.query('projects').withIndex('by_ownerId',q=>q.eq('ownerId',user)).order('desc').take(50);
  return projects.map(p=>({_id:p._id,name:p.name,savedAt:p.savedAt}));
}});

export const record=internalMutation({args:{storageId:v.id('_storage'),name:v.string()},handler:async(ctx,args)=>{
  const user=await requireUser(ctx);
  const existing=await ctx.db.query('projects').withIndex('by_ownerId',q=>q.eq('ownerId',user)).take(50);
  if(existing.length>=50)throw new ConvexError('You have 50 cloud snapshots. Delete an old snapshot first.');
  return ctx.db.insert('projects',{ownerId:user,name:args.name,storageId:args.storageId,savedAt:Date.now()});
}});

export const saveCopy=action({args:{json:v.string()},returns:v.id('projects'),handler:async(ctx,{json}):Promise<Id<'projects'>>=>{
  await requireUser(ctx);
  let doc;
  try {doc=parseJob(json);}catch(error){throw new ConvexError(error instanceof Error?error.message:'Invalid project.');}
  const canonical=JSON.stringify(doc);
  const storageId=await ctx.storage.store(new Blob([canonical],{type:'application/json'}));
  try {return await ctx.runMutation(internal.projects.record,{storageId,name:doc.name.trim()});}
  catch(error){await ctx.storage.delete(storageId);throw error;}
}});

export const readOwned=internalQuery({args:{id:v.id('projects')},handler:(ctx,{id})=>owned(ctx,id)});

export const open=action({args:{id:v.id('projects')},returns:v.string(),handler:async(ctx,{id}):Promise<string>=>{
  await requireUser(ctx);
  const doc:Doc<'projects'>=await ctx.runQuery(internal.projects.readOwned,{id});
  const blob=await ctx.storage.get(doc.storageId);
  if(!blob)throw new ConvexError('This project file is no longer available.');
  return blob.text();
}});

export const remove=mutation({args:{id:v.id('projects')},handler:async(ctx,{id})=>{
  const doc=await owned(ctx,id);
  await ctx.storage.delete(doc.storageId);
  await ctx.db.delete(id);
  return null;
}});
