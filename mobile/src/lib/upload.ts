import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { showAlert } from './alert';

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

/** Long edge of an uploaded photo: sharp enough for a face or an ID card. */
const MAX_EDGE = 1600;

/** The server takes up to 2 MB a file; anything bigger never arrives. */
const MAX_BYTES = 1_800_000;

/** A photo too big to send, which couldn't be made smaller on this phone. */
export class PhotoTooBigError extends Error {
  constructor() {
    super('This photo is too big to send. Take it again, or choose a smaller one.');
    this.name = 'PhotoTooBigError';
  }
}

async function resized(asset: ImagePicker.ImagePickerAsset, edge: number, compress: number): Promise<PickedFile> {
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const ctx = ImageManipulator.manipulate(asset.uri);
  // Unknown size (some phones don't say): make it no wider than `edge` anyway.
  if (!w || !h) ctx.resize({ width: edge });
  else if (Math.max(w, h) > edge) ctx.resize(w >= h ? { width: edge } : { height: edge });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress, format: SaveFormat.JPEG });
  const base = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '');
  return { uri: out.uri, fileName: `${base}.jpg`, mimeType: 'image/jpeg', exif: asset.exif ?? null };
}

/**
 * A phone camera photo can be 10 MB or more; the server takes 2 MB a file and
 * cuts off anything past ~10 MB (the app then only sees "Network error").
 * Photos go up at 1600px on the long edge as JPEG (~300–600 KB); if that
 * fails on a phone, once more smaller (1024px). A big photo that can't be
 * made smaller is never sent: PhotoTooBigError. The EXIF the picker read is
 * kept on the result for `photoFacts`. Videos and web files go as they are.
 */
export async function shrinkPhoto(asset: ImagePicker.ImagePickerAsset): Promise<PickedFile> {
  if (Platform.OS === 'web' || asset.type === 'video') return asset as PickedFile;
  try {
    return await resized(asset, MAX_EDGE, 0.7);
  } catch {
    try {
      return await resized(asset, 1024, 0.6);
    } catch {
      // Only a photo we know is small enough goes as it is.
      if (asset.fileSize && asset.fileSize <= MAX_BYTES) return asset as PickedFile;
      throw new PhotoTooBigError();
    }
  }
}

/** "Take photo" / "Upload file": the camera or the library, photos made upload-sized. Null when cancelled or not allowed. */
export async function pickFile(source: 'camera' | 'library', kinds: 'images' | 'media' = 'images'): Promise<PickedFile | null> {
  const mediaTypes: ImagePicker.MediaType[] = kinds === 'media' ? ['images', 'videos'] : ['images'];
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.6, exif: true });
    return res.canceled ? null : shrinkOrSay(res.assets[0]);
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.8, exif: true });
  return res.canceled ? null : shrinkOrSay(res.assets[0]);
}

/** Shrink, or say the photo is too big (and give nothing back) rather than send it. */
async function shrinkOrSay(asset: ImagePicker.ImagePickerAsset): Promise<PickedFile | null> {
  try {
    return await shrinkPhoto(asset);
  } catch (e) {
    showAlert('Photo too big', (e as Error).message);
    return null;
  }
}
