import {oauthAdminSession,sameOrigin} from '../../server/auth.js';
import {saveAdminPassword} from '../../server/password-auth.js';

const headers={'Cache-Control':'no-store'};

export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:'Forbidden.'},{status:403,headers});
  if(!await oauthAdminSession(request))return Response.json({error:'Sign in with Vercel as the admin first.'},{status:403,headers});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Expected JSON.'},{status:415,headers});
  try{
    const raw=await request.text();
    if(raw.length>1024)return Response.json({error:'Invalid password request.'},{status:400,headers});
    const body=JSON.parse(raw) as {password?:unknown};
    if(typeof body.password!=='string'||body.password.length<10||body.password.length>256)
      return Response.json({error:'Use a password between 10 and 256 characters.'},{status:400,headers});
    await saveAdminPassword(body.password);
    return Response.json({ok:true},{headers});
  }catch{return Response.json({error:'Could not save the password. Try again.'},{status:500,headers});}
}
