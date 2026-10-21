/* eslint-disable */
// Schema-derived bindings; `bunx convex dev` regenerates these for the deployment.
import type {DataModelFromSchemaDefinition,DocumentByName,TableNamesInDataModel} from 'convex/server';
import type {GenericId} from 'convex/values';
import schema from '../schema';
export type DataModel=DataModelFromSchemaDefinition<typeof schema>;
export type TableNames=TableNamesInDataModel<DataModel>;
export type Doc<T extends TableNames>=DocumentByName<DataModel,T>;
export type Id<T extends TableNames|'_storage'>=GenericId<T>;
