import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '../theme';

/**
 * The app's signature backdrop — a soft aurora, never flat white. A cool indigo
 * base drifting to a warm hint, with a gentle indigo glow at the top and a faint
 * gold wash at the bottom-right for depth. Sits behind every Screen.
 */
export function AppBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={gradients.aurora}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Top indigo aurora glow */}
      <LinearGradient
        colors={['rgba(46,91,240,0.13)', 'rgba(46,91,240,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.top}
      />
      {/* Barely-there warm gold wash, bottom-right (depth, not beige) */}
      <LinearGradient
        colors={['rgba(228,177,92,0)', 'rgba(228,177,92,0.035)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.warm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: '44%' },
  warm: { position: 'absolute', bottom: 0, right: 0, width: '85%', height: '34%' },
});
