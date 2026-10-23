import {adminSession,clientId} from '../../server/auth.js';

export async function GET(request:Request){return Response.json({configured:!!clientId(),admin:await adminSession(request)},{headers:{'Cache-Control':'no-store'}});}
