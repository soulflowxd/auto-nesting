import {adminSession,sameOrigin} from '../server/auth.js';
import {parseJob} from '../src/lib/job.js';
import {nestJob} from '../src/lib/nest-job.js';

export async function POST(request:Request){
  if(!sameOrigin(request)||!await adminSession(request))return Response.json({error:'Admin sign-in required.'},{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Expected JSON.'},{status:415});
  if(Number(request.headers.get('content-length'))>4_000_000)return Response.json({error:'This job is too large for Vercel server nesting. Use local nesting.'},{status:413});
  try{
    const job=parseJob(await request.text());
    const results=nestJob(job.parts,job.settings);
    return Response.json(results,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Server nesting failed.'},{status:400});}
}
