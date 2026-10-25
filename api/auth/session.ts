import {adminEmail,adminSession,clientId,clientSecret} from '../../server/auth.js';
import {passwordAuthConfigured} from '../../server/password-auth.js';

export async function GET(request:Request){return Response.json({configured:passwordAuthConfigured(),oauthConfigured:!!clientId()&&!!clientSecret()&&!!adminEmail(),admin:await adminSession(request)},{headers:{'Cache-Control':'no-store'}});}
