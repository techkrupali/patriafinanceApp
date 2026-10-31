import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/** For code outside the screens (SYS-06 error screen, SYS-08 links) to open a screen. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
