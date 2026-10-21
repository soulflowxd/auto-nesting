import {convexAuth} from '@convex-dev/auth/server';
import {Password} from '@convex-dev/auth/providers/Password';

export const {auth,signIn,signOut,store,isAuthenticated}=convexAuth({
  providers:[Password({validatePasswordRequirements(password){
    if(password.length<8||password.length>128)throw new Error('Use a password between 8 and 128 characters.');
  }})],
});
