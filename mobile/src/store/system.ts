import { create } from 'zustand';
import { navigationRef } from '../navigation/ref';

/**
 * SYS-06 "Contact support" from a screen that keeps failing: the app opens on
 * the support chat alone until the person leaves it.
 */
interface SystemState {
  supportOnly: boolean;
  setSupportOnly: (on: boolean) => void;
  /** Back to the app's tabs (the chat-only stack's state would otherwise carry over). */
  leaveSupportOnly: () => void;
}

export const useSystem = create<SystemState>((set) => ({
  supportOnly: false,
  setSupportOnly: (supportOnly) => set({ supportOnly }),
  leaveSupportOnly: () => {
    set({ supportOnly: false });
    setTimeout(() => {
      if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    }, 0);
  },
}));
