import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,
  projects: defineTable({ownerId:v.id('users'),name:v.string(),storageId:v.id('_storage'),savedAt:v.number()}).index('by_ownerId',['ownerId']),
});
