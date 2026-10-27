import type { Wallet } from '../api/types';

/**
 * Where "Invite" starts: people are invited into a wallet, so open the invite
 * flow for the first wallet that can be shared (not the main wallet), or make
 * a wallet first when there is none yet.
 */
export function inviteTarget(wallets: Wallet[] | undefined):
  | { screen: 'InviteMember'; params: { walletId: number } }
  | { screen: 'CreateWallet'; params: undefined } {
  const shareable = (wallets ?? []).find((w) => w.type !== 'main');
  return shareable ? { screen: 'InviteMember', params: { walletId: shareable.id } } : { screen: 'CreateWallet', params: undefined };
}
