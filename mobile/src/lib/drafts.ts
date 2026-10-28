import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useDeleteWalletDraft, useSaveWalletDraft, useWalletDrafts, type SaveDraftInput } from '../api/hooks';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CreatableWalletType, WalletDraft } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

/** Wait this long after the last edit before saving. */
const SAVE_DELAY_MS = 1200;

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * One setup "session" can span screens (Emergency Step 1 → Step 2): every screen
 * of it shares the draft id, the save queue and the merged form data, so they
 * never create two drafts or overwrite each other's answers.
 */
interface DraftSession {
  id: number | null;
  inFlight: boolean;
  queued: Omit<SaveDraftInput, 'id'> | null;
  stopped: boolean;
  data: Record<string, unknown>;
}

const sessions = new Map<string, DraftSession>();

function sessionFor(key: string, initialId: number | null, initialData: Record<string, unknown>): DraftSession {
  let session = sessions.get(key);
  if (!session) {
    session = { id: initialId, inFlight: false, queued: null, stopped: false, data: initialData };
    sessions.set(key, session);
  } else if (session.id === null && initialId) {
    session.id = initialId;
  }
  return session;
}

/** The latest merged answers of a multi-screen setup (e.g. Step 2 rules for Step 1's "Next"). */
export function draftSessionData(key: string): Record<string, unknown> {
  return sessions.get(key)?.data ?? {};
}

export function newDraftSessionKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AutosaveOptions {
  /** Share one draft across the screens of a setup; omit for a single-screen setup. */
  sessionKey?: string;
  initialDraftId?: number | null;
  /** The resumed draft's data, so other screens' answers are kept. */
  initialData?: Record<string, unknown>;
  type: CreatableWalletType;
  name: string;
  step: number;
  totalSteps: number;
  /** This screen's part of the form — never secrets (the server strips them too). */
  data: Record<string, unknown>;
  /** Only save once the user has entered something worth keeping. */
  enabled: boolean;
}

/**
 * Auto-saves a wallet setup as a draft (client: "Allow draft for all wallet
 * types… Allow auto-save"). Saves are debounced and serialized — the first save
 * creates the draft, later ones update it — and pending edits are flushed when
 * the screen unmounts, so leaving setup never loses work.
 */
export function useDraftAutosave({
  sessionKey,
  initialDraftId,
  initialData,
  type,
  name,
  step,
  totalSteps,
  data,
  enabled,
}: AutosaveOptions) {
  const save = useSaveWalletDraft();
  const remove = useDeleteWalletDraft();
  const mutateRef = useRef(save.mutate);
  mutateRef.current = save.mutate;

  const ownKey = useRef(newDraftSessionKey('draft')).current;
  const session = sessionFor(sessionKey ?? ownKey, initialDraftId ?? null, initialData ?? {});
  const lastSaved = useRef<string | null>(null);
  const [status, setStatus] = useState<DraftStatus>('idle');

  const payload: Omit<SaveDraftInput, 'id'> = {
    type,
    name: name.trim() || null,
    step,
    total_steps: totalSteps,
    data: { ...session.data, ...data },
  };
  const snapshot = JSON.stringify([payload.name, step, data]);
  const latest = useRef({ payload, snapshot, enabled });
  latest.current = { payload, snapshot, enabled };

  const flush = useCallback(
    (input: Omit<SaveDraftInput, 'id'>, snap: string) => {
      if (session.stopped) return;
      session.data = input.data;
      if (session.inFlight) {
        session.queued = input;
        return;
      }
      session.inFlight = true;
      setStatus('saving');
      mutateRef.current(
        { ...input, id: session.id },
        {
          onSuccess: (res) => {
            session.id = res.draft.id;
            lastSaved.current = snap;
            setStatus('saved');
          },
          onError: () => setStatus('error'),
          onSettled: () => {
            session.inFlight = false;
            const next = session.queued;
            session.queued = null;
            if (next) flush(next, JSON.stringify([next.name, next.step, next.data]));
          },
        },
      );
    },
    [session],
  );

  useEffect(() => {
    if (!enabled || session.stopped || snapshot === lastSaved.current) return;
    const t = setTimeout(() => flush(latest.current.payload, latest.current.snapshot), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [snapshot, enabled, flush, session]);

  // Leaving the screen mid-typing still keeps the latest edits.
  useEffect(
    () => () => {
      const { payload: last, snapshot: snap, enabled: on } = latest.current;
      if (on && !session.stopped && snap !== lastSaved.current) flush(last, snap);
    },
    [flush, session],
  );

  return {
    /** The saved draft's id (null until the first save lands). */
    draftId: session.id,
    status,
    /**
     * The wallet was created (the server removed the draft) — stop saving. The
     * stopped session stays in the map so a late re-render can't start a new one.
     */
    stop: () => {
      session.stopped = true;
    },
    /** Creating failed after stop() — keep saving the setup. */
    resume: () => {
      session.stopped = false;
    },
    /** The user chose to throw this setup away. */
    discard: async () => {
      session.stopped = true;
      if (session.id) await remove.mutateAsync(session.id).catch(() => undefined);
    },
  };
}

/** The saved draft for a resumed setup (undefined while the list loads). */
export function useDraft(draftId: number | undefined): { draft: WalletDraft | null; loading: boolean } {
  const drafts = useWalletDrafts();
  if (!draftId) return { draft: null, loading: false };
  return { draft: drafts.data?.find((d) => d.id === draftId) ?? null, loading: drafts.isLoading };
}

/**
 * "Cancel Setup": keep the draft to finish later, discard it, or carry on.
 * Nothing typed yet → just leave.
 */
export function confirmLeaveSetup(hasDraft: boolean, onKeep: () => void, onDiscard: () => void) {
  if (!hasDraft) {
    onKeep();
    return;
  }
  Alert.alert('Leave setup?', 'Your progress is saved as a draft in your wallet list. You can finish it any time.', [
    { text: 'Keep Editing', style: 'cancel' },
    { text: 'Discard Draft', style: 'destructive', onPress: onDiscard },
    { text: 'Keep Draft', onPress: onKeep },
  ]);
}

/** Open the setup journey a draft belongs to, where the user left off. */
export function resumeDraft(navigator: { navigate: (...args: never[]) => void }, draft: WalletDraft) {
  // Called from stack and tab screens alike; every target is a root-stack route.
  const navigation = navigator as unknown as NativeStackNavigationProp<RootStackParamList>;
  switch (draft.type) {
    case 'savings':
      navigation.navigate('SavingsWalletSetup', { draftId: draft.id });
      return;
    case 'goal':
      navigation.navigate('GoalWalletSetup', { draftId: draft.id });
      return;
    case 'emergency':
      navigation.navigate('EmergencyWalletSetup', { draftId: draft.id });
      return;
    case 'spending':
      navigation.navigate('SpendingWalletSetup', { draftId: draft.id });
      return;
    case 'giving':
      navigation.navigate('GivingWalletSetup', { draftId: draft.id });
      return;
    case 'joint':
      navigation.navigate('JointWalletSetup', { draftId: draft.id });
      return;
    case 'child':
      navigation.navigate('ChildWalletSetup', { draftId: draft.id });
      return;
    case 'project':
      navigation.navigate('ProjectWalletSetup', { draftId: draft.id });
      return;
    default:
      navigation.navigate('WalletSetup', { type: draft.type, draftId: draft.id });
  }
}
