import React, { useState } from 'react';
import { PtStepScreen } from '../components/pt/PtStepScreen';
import { PtCard, PtRow } from '../components/pt/PtList';
import { PtSwitch } from '../components/pt/PtTabScreen';
import { PtButton } from '../components/pt/PtButton';
import { useHomePrefs, type HomeSection } from '../store/homePrefs';
import { notifySuccess } from '../lib/haptics';
import { pt } from '../theme';
import type { RootScreenProps } from '../navigation/types';

const SECTIONS: { key: HomeSection; title: string }[] = [
  { key: 'upcoming', title: 'Next 7 days' },
  { key: 'goals', title: 'Goals' },
  { key: 'projects', title: 'Projects' },
];

/** HOM-08 Customise home: which sections show, and hiding balances on open. */
export function CustomiseHomeScreen({ navigation }: RootScreenProps<'CustomiseHome'>) {
  const saved = useHomePrefs();
  const [sections, setSections] = useState(saved.sections);
  const [hideOnOpen, setHideOnOpen] = useState(saved.hideOnOpen);

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      title="Customise home"
      subtitle="Pick what you see"
      footer={
        <PtButton
          title="Save"
          onPress={() => {
            void saved.save({ sections, hideOnOpen });
            notifySuccess();
            navigation.goBack();
          }}
        />
      }
    >
      <PtCard>
        <PtRow title="Total and quick actions" right="Always on" minHeight={56} />
        <PtRow title="Needs you" right="Always on" minHeight={56} />
        {SECTIONS.map((s, i) => (
          <PtRow
            key={s.key}
            title={s.title}
            minHeight={56}
            last={i === SECTIONS.length - 1}
            right={
              <PtSwitch
                label={s.title}
                value={sections[s.key]}
                onChange={(v) => setSections((prev) => ({ ...prev, [s.key]: v }))}
              />
            }
          />
        ))}
      </PtCard>
      <PtCard>
        <PtRow
          title="Hide balances when I open the app"
          subtitle="Tap the eye on Home to show them"
          subtitleColor={pt.inkMuted}
          last
          right={<PtSwitch label="Hide balances when I open the app" value={hideOnOpen} onChange={setHideOnOpen} />}
        />
      </PtCard>
    </PtStepScreen>
  );
}
