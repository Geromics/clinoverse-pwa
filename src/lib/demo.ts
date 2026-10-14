// Public demo account (intentionally shared; see RESURRECTION.md).
import { fileKeygen, identityFromMnemonic } from './crypto';

export const demoMnemonic = 'rural list erase clarify human repeat keep rhythm embark hollow merry guess';
export const isDemoMnemonic = (m: string) => m === demoMnemonic;
export const demoFileKeygen = () => fileKeygen(identityFromMnemonic(demoMnemonic).privateKey);
