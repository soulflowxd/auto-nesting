import {adminEmail,adminSession,clientId,clientSecret} from '../../server/auth.js';

export async function GET(request:Request){return Response.json({configured:!!clientId()&&!!clientSecret()&&!!adminEmail(),admin:await adminSession(request)},{headers:{'Cache-Control':'no-store'}});}
