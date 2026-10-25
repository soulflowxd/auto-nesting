import {cookie,sameOrigin} from '../../server/auth.js';
import {newPasswordSession,passwordAuthConfigured,passwordMatches,passwordSessionSeconds} from '../../server/password-auth.js';

const noStore={'Cache-Control':'no-store'};

export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:'Forbidden.'},{status:403,headers:noStore});
  if(!passwordAuthConfigured())return Response.json({error:'Admin sign-in is not configured.'},{status:503,headers:noStore});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Expected JSON.'},{status:415,headers:noStore});
  if(Number(request.headers.get('content-length'))>2048)return Response.json({error:'Invalid sign-in request.'},{status:400,headers:noStore});
  try{
    const raw=await request.text();
    if(raw.length>2048)return Response.json({error:'Invalid sign-in request.'},{status:400,headers:noStore});
    const body=JSON.parse(raw) as {identifier?:unknown;password?:unknown};
    if(typeof body.identifier!=='string'||typeof body.password!=='string'||body.identifier.length>254||body.password.length>256)
      return Response.json({error:'Incorrect email, username, or password.'},{status:401,headers:noStore});
    if(!await passwordMatches(body.identifier,body.password))return Response.json({error:'Incorrect email, username, or password.'},{status:401,headers:noStore});
    const token=await newPasswordSession();
    return Response.json({ok:true},{headers:{...noStore,'Set-Cookie':cookie('itkan_admin',token,passwordSessionSeconds)}});
  }catch{return Response.json({error:'Invalid sign-in request.'},{status:400,headers:noStore});}
}
