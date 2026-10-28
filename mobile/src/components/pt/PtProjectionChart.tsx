import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { pt, ptFont } from '../../theme';
import { formatNairaK } from '../../lib/format';

/**
 * SAV-04 "Your projection": saved money month by month up to the date, with the
 * target as a dashed gold line. Points are naira; the first one is "Now".
 */
export function PtProjectionChart({ points, target }: { points: { label: string; value: number }[]; target: number }) {
  const [width, setWidth] = useState(0);
  const height = 132;
  const top = 18;
  const bottom = 8;
  const max = Math.max(target, ...points.map((p) => p.value), 1) * 1.05;
  const x = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * (width - 12) + 6);
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${height} L${x(0)},${height} Z`;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={`Projection to ${formatNairaK(points[points.length - 1]?.value ?? 0)}`}>
      {width > 0 && points.length > 1 ? (
        <Svg width={width} height={height}>
          <Path d={area} fill={pt.brandSoft} />
          <Line x1={0} x2={width} y1={y(target)} y2={y(target)} stroke={pt.gold500} strokeWidth={1.5} strokeDasharray="5 4" />
          <SvgText x={width - 4} y={y(target) - 5} fill="#8F5400" fontSize={11} fontFamily={ptFont.semibold} textAnchor="end">
            {`Target ${formatNairaK(target)}`}
          </SvgText>
          <Path d={line} stroke={pt.brand} strokeWidth={2.5} fill="none" />
          {points.map((p, i) => (
            <Circle key={p.label + i} cx={x(i)} cy={y(p.value)} r={4} fill={pt.raised} stroke={pt.brand} strokeWidth={2} />
          ))}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {points.map((p, i) => (
          <Text key={p.label + i} style={{ fontFamily: ptFont.medium, fontSize: 11, color: pt.inkMuted }}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
