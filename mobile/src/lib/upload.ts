import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** A picked photo, video or file, as expo-image-picker returns it. */
export interface PickedFile {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  /** On web, the browser's File. */
  file?: File;
  /** The photo's EXIF, when the picker could read it. */
  exif?: Record<string, unknown> | null;
}

/**
 * When and where a photo was taken, from its EXIF ("2026:10:21 10:42:13",
 * GPS degrees with N/S and E/W). Empty when the phone didn't keep them.
 */
export function photoFacts(asset: PickedFile): { taken_at?: string; lat?: number; lng?: number } {
  const x = asset.exif ?? {};
  const out: { taken_at?: string; lat?: number; lng?: number } = {};
  const raw = (x.DateTimeOriginal ?? x.DateTime) as string | undefined;
  const m = typeof raw === 'string' ? raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/) : null;
  if (m) {
    // EXIF time is the phone's local time with no zone: send it with the phone's offset.
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    const off = -local.getTimezoneOffset();
    const zone = `${off >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`;
    out.taken_at = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`;
  }
  const gps = (x['{GPS}'] as Record<string, unknown> | undefined) ?? x;
  const lat = Number(gps.GPSLatitude ?? gps.Latitude);
  const lng = Number(gps.GPSLongitude ?? gps.Longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    out.lat = String(gps.GPSLatitudeRef ?? gps.LatitudeRef ?? 'N').toUpperCase().startsWith('S') ? -Math.abs(lat) : lat;
    out.lng = String(gps.GPSLongitudeRef ?? gps.LongitudeRef ?? 'E').toUpperCase().startsWith('W') ? -Math.abs(lng) : lng;
  }
  return out;
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
    const res = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.7, exif: true });
    return res.canceled ? null : (res.assets[0] as PickedFile);
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.7, exif: true });
  return res.canceled ? null : (res.assets[0] as PickedFile);
}
