import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { pt } from '../../theme';
import { qrMatrix } from '../../lib/qr';

/** A QR code (CHW-06 "scan this"), drawn as one path, with a 2-module quiet zone. */
export function PtQrCode({ value, size = 150 }: { value: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const m = qrMatrix(value);
    const quiet = 2;
    let path = '';
    m.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      }),
    );
    return { d: path, n: m.length + quiet * 2 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel={`QR code for ${value}`}>
      <Rect width={n} height={n} fill="#FFFFFF" />
      <Path d={d} fill={pt.ink} />
    </Svg>
  );
}
