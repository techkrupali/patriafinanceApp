import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel } from '../../components/pt/PtForm';
import { selection } from '../../lib/haptics';

/** CHD-08: one short tip a day, each with a quick quiz. */
const TIPS: { topic: string; title: string; body: string; quiz: string; options: string[]; answer: number; why: string }[] = [
  { topic: 'Needs and wants', title: 'A need is something you must have. A want is nice to have.', body: 'Buy needs first. Save up for wants. That is how goals get done.', quiz: 'Lunch at school is a…', options: ['Need', 'Want'], answer: 0, why: 'Right! Food is a need. Fancy snacks after football? That is a want.' },
  { topic: 'Saving a little', title: 'Small amounts add up.', body: 'Saving ₦200 every week is ₦10,400 in a year. Little by little fills the basket.', quiz: '₦500 a week for 10 weeks is…', options: ['₦5,000', '₦500'], answer: 0, why: 'Yes! 10 times ₦500 is ₦5,000.' },
  { topic: 'Waiting', title: 'Wait a day before buying a want.', body: 'If you still want it tomorrow, it may be worth it. If not, you kept your money.', quiz: 'You see a new toy you didn’t plan for. What first?', options: ['Wait a day', 'Buy it now'], answer: 0, why: 'Good choice. Waiting helps you spend on what really matters to you.' },
  { topic: 'Giving', title: 'Giving is part of money too.', body: 'Many families put a little aside to help others. It feels good and helps someone.', quiz: 'Is giving a good use of money?', options: ['Yes', 'No'], answer: 0, why: 'Yes. Saving, spending and giving all matter.' },
  { topic: 'Prices', title: 'The same thing can cost different prices.', body: 'Look in two places before you buy something big. You might save money.', quiz: 'Two shops sell the same ball. One is cheaper. Which do you pick?', options: ['The cheaper one', 'The dearer one'], answer: 0, why: 'Smart! Same ball, more money left for you.' },
  { topic: 'Earning', title: 'Money comes from work.', body: 'Your parents work for money. Tasks at home let you earn some too.', quiz: 'How can you earn money at home?', options: ['Doing tasks', 'Asking every day'], answer: 0, why: 'Exactly. Check your Tasks to earn.' },
  { topic: 'Safety', title: 'Never share your PIN.', body: 'Not with friends, not with anyone who calls you. Only you should know it.', quiz: 'A friend asks for your PIN. What do you do?', options: ['Say no', 'Tell them'], answer: 0, why: 'Right. Your PIN is only for you. Tell a parent if anyone asks.' },
];

/** CHD-08 Money tips: today's tip and a quick quiz. */
export function ChildTipsScreen() {
  const navigation = useNavigation();
  const day = Math.floor(Date.now() / 86_400_000);
  const tip = TIPS[day % TIPS.length];
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <PtTabScreen title="Money tips" onBack={() => navigation.goBack()}>
      <Text style={{ marginTop: -10, fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>One quick tip a day</Text>
      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 10 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 12, letterSpacing: 1, color: pt.emerald300 }}>{`TIP ${(day % TIPS.length) + 1} · ${tip.topic.toUpperCase()}`}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, lineHeight: 28, color: '#FFFFFF' }}>{tip.title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.onDarkMuted }}>{tip.body}</Text>
      </View>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>Quick quiz</PtGroupLabel>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{tip.quiz}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {tip.options.map((o, i) => {
            const right = picked !== null && i === tip.answer;
            const wrong = picked === i && i !== tip.answer;
            return (
              <Pressable
                key={o}
                onPress={() => {
                  selection();
                  setPicked(i);
                }}
                accessibilityRole="button"
                style={{ flex: 1, height: 52, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: right ? pt.brand : wrong ? pt.danger : pt.lineStrong, backgroundColor: right ? pt.brandSoft : pt.raised, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: right ? pt.brand : wrong ? pt.danger : pt.ink }}>{right ? `${o} ✓` : o}</Text>
              </Pressable>
            );
          })}
        </View>
        {picked !== null ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>{picked === tip.answer ? tip.why : 'Not quite. Have another go!'}</Text> : null}
      </View>
      <PtButton title="Next tip tomorrow" variant="secondary" onPress={() => navigation.goBack()} />
    </PtTabScreen>
  );
}
