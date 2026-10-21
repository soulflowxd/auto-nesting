// Match the Convex Auth route compatibility patch used in 2026-scouting.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import process from 'node:process';
const file=join(process.cwd(),'node_modules','@convex-dev','auth','dist','react','client.js');
if(existsSync(file)){
  const source=readFileSync(file,'utf8');
  const patched=source.replaceAll('"auth:signIn"','"auth.js:signIn"').replaceAll('"auth:signOut"','"auth.js:signOut"');
  if(patched!==source)writeFileSync(file,patched);
}
