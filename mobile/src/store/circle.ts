import { create } from 'zustand';

/** HOM-06: which circle the Family tab shows (null = your own family). */
interface CircleState {
  circleId: number | null;
  setCircle: (id: number | null) => void;
}

export const useCircleStore = create<CircleState>((set) => ({
  circleId: null,
  setCircle: (circleId) => set({ circleId }),
}));
