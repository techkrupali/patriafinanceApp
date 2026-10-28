import type { WalletColour } from '../api/types';

/** SAV-01 "Colour": the wallet's ring and icon tile. */
export const WALLET_COLOURS: Record<WalletColour, string> = {
  emerald: '#0B5D4B',
  mint: '#1FA07A',
  gold: '#F2A93B',
  deep: '#08392F',
  clay: '#C2410C',
  violet: '#6D28D9',
};

export const WALLET_COLOUR_KEYS = Object.keys(WALLET_COLOURS) as WalletColour[];

export function walletColour(colour: WalletColour | null | undefined): string | undefined {
  return colour ? WALLET_COLOURS[colour] : undefined;
}
