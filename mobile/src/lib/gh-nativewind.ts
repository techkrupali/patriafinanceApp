import { Pressable, TouchableOpacity } from 'react-native-gesture-handler';
import { cssInterop } from 'nativewind';

/**
 * NativeWind doesn't know how to apply `className` to gesture-handler's
 * touchables out of the box. We route all touch through RNGH (to fix the
 * Fabric/Android native-stack onPress bug), so register them here — otherwise
 * any RNGH Pressable that carries its own className renders unstyled (broken
 * card / row layouts). Imported once, at app start.
 */
cssInterop(Pressable, { className: 'style' });
cssInterop(TouchableOpacity, { className: 'style' });
