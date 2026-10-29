import React, { useState } from 'react';
import { View } from 'react-native';
import { usePostReview } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { Stars, TextArea } from '../../components/project/ProjectUi';
import { REVIEW_TAGS } from '../../lib/projects';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

/** VND-04 "Rate Adeyemi Builders": stars, what went well, a few words, first name only. */
export function RateVendorScreen({ navigation, route }: RootScreenProps<'RateVendor'>) {
  const { profileId, name, milestoneId, milestoneTitle, projectId, town } = route.params;
  const me = useAuth((s) => s.user);
  const post = usePostReview(profileId);
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [firstOnly, setFirstOnly] = useState(true);
  const shownAs = firstOnly ? me?.first_name ?? 'You' : `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim();

  const submit = () => {
    post.mutate(
      { rating, tags, body: body.trim() || undefined, first_name_only: firstOnly, milestone_id: milestoneId, project_id: milestoneId ? undefined : projectId },
      {
        onSuccess: () => {
          showAlert('Thank you', `Your review helps other families choose ${name}.`);
          navigation.goBack();
        },
        onError: (e) => showAlert('Could not post', (e as Error).message),
      },
    );
  };

  return (
    <PtPageScreen
      title={`Rate ${name}`}
      subtitle={milestoneTitle ? `After: ${milestoneTitle}` : undefined}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Post review" onPress={submit} loading={post.isPending} />}
      gap={18}
    >
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Stars value={rating} size={36} onChange={setRating} />
      </View>
      <PtGroupLabel>What went well</PtGroupLabel>
      <PtPills options={REVIEW_TAGS} value={tags} onChange={(t) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))} />
      <TextArea label="Your review" value={body} onChange={setBody} placeholder="Good work and clear photos at every step." maxLength={1000} minHeight={120} />
      <PtPanel>
        <PtSwitchRow title="Show my first name only" subtitle={town ? `${shownAs}, ${town}` : shownAs} value={firstOnly} onChange={setFirstOnly} />
      </PtPanel>
    </PtPageScreen>
  );
}
