import {adminEmail,adminSession,clientId,clientSecret,oauthAdminSession} from '../../server/auth.js';
import {passwordAuthConfigured} from '../../server/password-auth.js';

export async function GET(request:Request){return Response.json({configured:await passwordAuthConfigured(),oauthConfigured:!!clientId()&&!!clientSecret()&&!!adminEmail(),admin:await adminSession(request),oauthAdmin:await oauthAdminSession(request)},{headers:{'Cache-Control':'no-store'}});}
