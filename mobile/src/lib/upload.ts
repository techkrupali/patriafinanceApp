import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** A picked photo, video or file, as expo-image-picker returns it. */
export interface PickedFile {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  /** On web, the browser's File. */
  file?: File;
}

/**
 * Adds a picked file to a multipart form. React Native sends `{ uri, name,
 * type }`; a browser needs the actual bytes, so on web the file (or the blob
 * behind its URI) goes in instead.
 */
export async function appendFile(form: FormData, field: string, asset: PickedFile, fallbackName = 'upload'): Promise<void> {
  const ext = asset.mimeType?.split('/')[1] || asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  const name = asset.fileName || `${fallbackName}.${ext}`;
  if (Platform.OS === 'web') {
    const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
    form.append(field, blob, name);
    return;
  }
  form.append(field, { uri: asset.uri, name, type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
}

/** "Take photo" / "Upload file": the camera or the library. Null when cancelled or not allowed. */
export async function pickFile(source: 'camera' | 'library', kinds: 'images' | 'media' = 'images'): Promise<PickedFile | null> {
  const mediaTypes: ImagePicker.MediaType[] = kinds === 'media' ? ['images', 'videos'] : ['images'];
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.7 });
    return res.canceled ? null : (res.assets[0] as PickedFile);
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.7 });
  return res.canceled ? null : (res.assets[0] as PickedFile);
}
