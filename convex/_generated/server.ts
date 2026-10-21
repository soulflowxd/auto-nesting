/* eslint-disable */
// Standard Convex bindings. Regenerated when connecting a deployment.
import {queryGeneric,internalQueryGeneric,mutationGeneric,internalMutationGeneric,actionGeneric,internalActionGeneric,httpActionGeneric} from 'convex/server';
import type {QueryBuilder,MutationBuilder,ActionBuilder,HttpActionBuilder,GenericQueryCtx,GenericMutationCtx,GenericActionCtx} from 'convex/server';
import type {DataModel} from './dataModel';
export const query:QueryBuilder<DataModel,'public'>=queryGeneric;
export const internalQuery:QueryBuilder<DataModel,'internal'>=internalQueryGeneric;
export const mutation:MutationBuilder<DataModel,'public'>=mutationGeneric;
export const internalMutation:MutationBuilder<DataModel,'internal'>=internalMutationGeneric;
export const action:ActionBuilder<DataModel,'public'>=actionGeneric;
export const internalAction:ActionBuilder<DataModel,'internal'>=internalActionGeneric;
export const httpAction:HttpActionBuilder=httpActionGeneric;
export type QueryCtx=GenericQueryCtx<DataModel>;
export type MutationCtx=GenericMutationCtx<DataModel>;
export type ActionCtx=GenericActionCtx<DataModel>;
