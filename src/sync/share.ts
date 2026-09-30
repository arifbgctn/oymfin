export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/** iPhone/iPad: paylaşım sayfasında "Dosyalara Kaydet" (iCloud Drive) çıkar. */
export function prefersShareSheet(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Senkron dosyasını kaydeder. Kullanıcı hareketi (tıklama) kaybolmasın diye bu fonksiyon
 * tıklama işleyicisinden, arada `await` olmadan çağrılmalı.
 */
export async function saveFile(text: string, fileName: string): Promise<SaveOutcome> {
  const file = new File([text], fileName, { type: 'application/json' });
  if (prefersShareSheet() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'oymfin senkron dosyası' });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // Paylaşım başarısızsa indirmeye düş.
    }
  }
  download(file);
  return 'downloaded';
}

export function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
