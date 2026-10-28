import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { selection } from '../../lib/haptics';
import type { CreatableWalletType } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Icon = (color: string) => React.ReactNode;

const TYPES: { type: CreatableWalletType; title: string; tagline: string; icon: Icon }[] = [
  { type: 'goal', title: 'Goal', tagline: 'School fees, rent, a car', icon: (c) => <Feather name="target" size={20} color={c} /> },
  { type: 'spending', title: 'Spending', tagline: 'Monthly household budget', icon: (c) => <Feather name="shopping-bag" size={19} color={c} /> },
  { type: 'savings', title: 'Savings', tagline: 'Put money aside, lock it', icon: (c) => <MaterialCommunityIcons name="piggy-bank-outline" size={21} color={c} /> },
  { type: 'project', title: 'Project', tagline: 'Building, pay by milestone', icon: (c) => <MaterialCommunityIcons name="hard-hat" size={20} color={c} /> },
  { type: 'joint', title: 'Joint', tagline: 'Run money with a partner', icon: (c) => <Feather name="users" size={19} color={c} /> },
  { type: 'child', title: 'Child', tagline: 'Allowance and requests', icon: (c) => <Feather name="smile" size={20} color={c} /> },
  { type: 'emergency', title: 'Emergency', tagline: 'Release only when agreed', icon: (c) => <Feather name="life-buoy" size={20} color={c} /> },
  { type: 'giving', title: 'Giving', tagline: 'Tithes, offerings, support', icon: (c) => <Feather name="heart" size={19} color={c} /> },
];

function TypeCard({ item, on, onPress }: { item: (typeof TYPES)[number]; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${item.title}. ${item.tagline}`}
      style={{
        flex: 1,
        minHeight: 130,
        borderRadius: ptRadius.md,
        padding: 14,
        gap: 10,
        backgroundColor: on ? pt.brandSoft : pt.raised,
        borderWidth: 2,
        borderColor: on ? pt.brand : 'transparent',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? pt.brand : pt.brandSoft,
        }}
      >
        {item.icon(on ? pt.onBrand : pt.brand)}
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 22, color: on ? pt.brand : pt.ink }}>{item.title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{item.tagline}</Text>
      </View>
    </Pressable>
  );
}

/**
 * WCR-01 "What's this wallet for?" — the first step of guided wallet creation.
 * Goal, Savings and Emergency continue into the prototype's flows; Project and
 * the other types keep their own setup journeys for now.
 */
export function CreateWalletScreen({ navigation }: RootScreenProps<'CreateWallet'>) {
  const [type, setType] = useState<CreatableWalletType>('goal');

  const next = () => {
    if (type === 'goal') navigation.navigate('GoalWalletSetup');
    else if (type === 'savings') navigation.navigate('SavingsWalletSetup');
    else if (type === 'emergency') navigation.navigate('EmergencyWalletSetup');
    else if (type === 'project') navigation.navigate('CreateProject');
    else navigation.navigate('WalletSetup', { type });
  };

  const rows = [0, 2, 4, 6].map((i) => TYPES.slice(i, i + 2));

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      closeIcon
      progress={{ step: 1, total: 5 }}
      title="What's this wallet for?"
      subtitle="Each type comes with sensible rules you can change later."
      gap={20}
      footer={<PtButton title="Continue" onPress={next} />}
    >
      <View style={{ gap: 12 }}>
        {rows.map((row) => (
          <View key={row[0].type} style={{ flexDirection: 'row', gap: 12 }}>
            {row.map((item) => (
              <TypeCard key={item.type} item={item} on={item.type === type} onPress={() => setType(item.type)} />
            ))}
          </View>
        ))}
      </View>
    </PtStepScreen>
  );
}
