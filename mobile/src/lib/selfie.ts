import type { PickedFile } from './upload';

/**
 * A selfie taken on one step (ACC-06 new phone, ACC-04 forgot PIN) and sent on
 * the next. Kept here rather than in navigation params, which must stay
 * serialisable (a browser File isn't).
 */
let pending: PickedFile | null = null;

export const pendingSelfie = {
  set(file: PickedFile | null) {
    pending = file;
  },
  take(): PickedFile | null {
    const file = pending;
    pending = null;
    return file;
  },
  peek(): PickedFile | null {
    return pending;
  },
};
