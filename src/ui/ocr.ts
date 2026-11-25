/**
 * Reads the text on a picture, on this computer. The reader and its English data are shipped with the app (public/ocr),
 * so no picture ever leaves the computer and nothing is paid per picture. It loads only when a poster is read.
 *
 * Posters use fancy fonts, glow and coloured text on dark art, and one pass often misses a line. So the picture is read
 * three ways (as it is; enlarged and made black and white; enlarged and read as blocks of text) and the readings are
 * put together. The caller keeps only labelled lines and the person checks them.
 */
function enlarged(image: string, threshold: number | null): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(image);
    img.onload = () => {
      const scale = Math.max(1, Math.min(3, 2200 / Math.max(img.naturalWidth, img.naturalHeight)));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      if (!ctx) { resolve(image); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        const v = threshold === null ? g : g > threshold ? 255 : 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      }
      ctx.putImageData(d, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.src = image;
  });
}

export async function readPictureText(image: string): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const base = `${import.meta.env.BASE_URL}ocr/`;
  const worker = await createWorker('eng', 1, { workerPath: `${base}worker.min.js`, corePath: base, langPath: `${base}lang`, gzip: true, cacheMethod: 'none' });
  try {
    const passes: { src: Promise<string>; psm: string }[] = [
      { src: Promise.resolve(image), psm: '11' },       // sparse text: posters are not paragraphs
      { src: enlarged(image, 140), psm: '11' },
      { src: enlarged(image, null), psm: '4' },         // blocks of text of different sizes
    ];
    const texts: string[] = [];
    for (const p of passes) {
      await worker.setParameters({ tessedit_pageseg_mode: p.psm as never });
      texts.push((await worker.recognize(await p.src)).data.text);
    }
    return texts.join('\n');
  } finally {
    await worker.terminate();
  }
}
