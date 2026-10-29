import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { useDeleteProjectDocument, useUploadProjectDocument } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtNote, PtPanel, PtPills } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { FileRow, LoadingBlock, PhotoGrid } from '../../components/project/ProjectUi';
import { pickFile } from '../../lib/upload';
import { dayMonth } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { ProjectDocument } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const KINDS: { value: ProjectDocument['kind']; label: string }[] = [
  { value: 'contract', label: 'Contract' },
  { value: 'boq', label: 'Bill of quantities' },
  { value: 'other', label: 'Other' },
];

/** PRJ-09 Documents: the contract and bill of quantities, receipts from the builder, and every site photo. */
export function ProjectDocumentsScreen({ navigation, route }: RootScreenProps<'ProjectDocuments'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const me = useAuth((s) => s.user);
  const upload = useUploadProjectDocument(projectId);
  const remove = useDeleteProjectDocument(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<ProjectDocument['kind']>('contract');
  const [name, setName] = useState('');
  const [view, setView] = useState<'receipts' | 'photos' | null>(null);
  const data = query.data;

  const add = async (source: 'camera' | 'library') => {
    const asset = await pickFile(source);
    if (!asset) return;
    upload.mutate(
      { asset, kind, name: name.trim() || KINDS.find((k) => k.value === kind)?.label },
      {
        onSuccess: () => { setAddOpen(false); setName(''); },
        onError: (e) => showAlert('Could not upload', (e as Error).message),
      },
    );
  };

  const photos = data?.milestones.flatMap((m) => m.evidence.filter((e) => e.kind !== 'receipt').map((e) => ({ ...e, milestone: m.title }))) ?? [];
  const mine = (d: ProjectDocument) => data?.project.my_role === 'owner' || d.uploaded_by === `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim();

  return (
    <PtPageScreen
      title="Documents"
      subtitle={data?.project.title}
      onBack={() => navigation.goBack()}
      right={
        <Pressable onPress={() => { selection(); setAddOpen(true); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add a document">
          <Feather name="plus" size={24} color={pt.ink} />
        </Pressable>
      }
    >
      {!data ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <PtPanel>
            {data.documents.map((d) => (
              <FileRow
                key={d.id}
                title={d.name}
                sub={`${d.url.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Photo'} · added ${dayMonth(d.created_at)}${d.uploaded_by ? ` by ${d.uploaded_by.split(' ')[0]}` : ''}`}
                onPress={() => void Linking.openURL(d.url)}
                right={
                  mine(d) ? (
                    <Pressable
                      onPress={() => {
                        selection();
                        showAlert('Remove this document?', d.name, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(d.id, { onError: (e) => showAlert('Could not remove', (e as Error).message) }) },
                        ]);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${d.name}`}
                    >
                      <Feather name="trash-2" size={18} color={pt.inkSubtle} />
                    </Pressable>
                  ) : undefined
                }
              />
            ))}
            <FileRow icon="file" title="Receipts" sub={`${data.receipts.length} file${data.receipts.length === 1 ? '' : 's'}`} onPress={data.receipts.length ? () => setView('receipts') : undefined} />
            <FileRow icon="camera" title="Site photos" sub={`${data.site_photos} photo${data.site_photos === 1 ? '' : 's'} · from milestones`} onPress={photos.length ? () => setView('photos') : undefined} last />
          </PtPanel>
          <PtNote>Photos and receipts from milestone submissions are saved here automatically, with the date they were added.</PtNote>
        </>
      )}

      <PtSheet visible={addOpen} title="Add a document" subtitle="A photo of it, or a PDF from your phone." onClose={() => setAddOpen(false)}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PtButton title="Take photo" variant="secondary" onPress={() => void add('camera')} disabled={upload.isPending} style={{ flex: 1 }} />
            <PtButton title="Upload file" onPress={() => void add('library')} loading={upload.isPending} style={{ flex: 1 }} />
          </View>
        }
      >
        <PtPills options={KINDS} value={kind} onChange={setKind} />
        <PtField label="Name (optional)" value={name} onChangeText={setName} placeholder="Contract with Adeyemi Builders" maxLength={120} />
      </PtSheet>

      <PtSheet visible={view === 'receipts'} title="Receipts" onClose={() => setView(null)}>
        {data?.receipts.map((r, i) => (
          <FileRow key={r.id} title={r.caption || `Receipt ${i + 1}`} sub={`${data.milestones.find((m) => m.id === r.milestone_id)?.title ?? ''} · ${dayMonth(r.created_at)}`} onPress={() => void Linking.openURL(r.url)} last={i === data.receipts.length - 1} />
        ))}
      </PtSheet>
      <PtSheet visible={view === 'photos'} title="Site photos" onClose={() => setView(null)}>
        <PhotoGrid photos={photos.map((e) => ({ key: e.id, url: e.url, caption: e.caption || e.milestone, video: e.kind === 'video' }))} />
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{photos.length} from milestone submissions</Text>
      </PtSheet>
    </PtPageScreen>
  );
}
