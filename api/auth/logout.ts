import {clearCookie,sameOrigin} from '../../server/auth';

export function POST(request:Request){if(!sameOrigin(request))return new Response('Forbidden',{status:403});return Response.json({ok:true},{headers:{'Set-Cookie':clearCookie('itkan_admin'),'Cache-Control':'no-store'}});}
