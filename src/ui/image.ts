/** Reads an image file and shrinks it so a deck full of posters still fits in local storage. */
export function fileToDataUrl(file: File, maxSide = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image'));
      img.onload = () => {
        const r = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * r));
        const h = Math.max(1, Math.round(img.naturalHeight * r));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) { resolve(src); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(file.type === 'image/png' && file.size < 300_000 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', quality));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
