import { nestJob } from '../lib/nest-job';
self.onmessage=event=>{
  try {self.postMessage({result:nestJob(event.data.parts,event.data.settings)});}
  catch(error) {self.postMessage({error:error instanceof Error?error.message:'Nesting failed.'});}
};
