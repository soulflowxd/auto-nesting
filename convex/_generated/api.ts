/* eslint-disable */
import type * as auth from '../auth';
import type * as projects from '../projects';
import {anyApi,type ApiFromModules,type FilterApi,type FunctionReference} from 'convex/server';
const fullApi:ApiFromModules<{auth:typeof auth;projects:typeof projects}>=anyApi as any;
export const api:FilterApi<typeof fullApi,FunctionReference<any,'public'>>=anyApi as any;
export const internal:FilterApi<typeof fullApi,FunctionReference<any,'internal'>>=anyApi as any;
