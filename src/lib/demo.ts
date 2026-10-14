// Public demo account (intentionally shared; see RESURRECTION.md).
import { identityFromMnemonic } from './crypto';

export const demoMnemonic = 'rural list erase clarify human repeat keep rhythm embark hollow merry guess';
export const isDemoMnemonic = (m: string) => m === demoMnemonic;
// The demo file's key is wrapped to the demo account, so users who link it unwrap it with this.
export const demoIdentity = () => identityFromMnemonic(demoMnemonic);
