import * as FileSystem from './expo-file-system';

const guessMimeType = (url: string): string => {
  const lower = url.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
};

const getFileName = (url: string, dialogTitle?: string): string => {
  let baseName = '';
  if (dialogTitle) {
    const cleaned = dialogTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
    baseName = cleaned;
  } else {
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1] || '';
    baseName = lastPart.split('.')[0] || 'export';
  }
  const extMatch = url.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0] : '';
  return baseName + ext;
};

const triggerDownload = (content: string, filename: string, mimeType: string, isBase64: boolean) => {
  try {
    let blob: Blob;
    if (isBase64) {
      const byteChars = atob(content);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: mimeType });
    } else {
      blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    console.warn('Download failed', e);
    return false;
  }
};

export const isAvailableAsync = async () => {
  return true;
};

export const shareAsync = async (url: string, options?: any) => {
  try {
    const mimeType = options?.mimeType || guessMimeType(url);
    const filename = getFileName(url, options?.dialogTitle);

    try {
      const content = await FileSystem.readAsStringAsync(url);
      if (content) {
        const isImage = mimeType.startsWith('image/');
        let isBase64 = false;
        if (isImage) {
          const base64Prefix = 'base64:';
          if (content.startsWith(base64Prefix)) {
            isBase64 = true;
          } else if (!content.startsWith('{') && !content.startsWith('<') && !content.startsWith('[')) {
            isBase64 = true;
          }
        }
        const downloadContent = content.startsWith('base64:') ? content.substring(7) : content;
        triggerDownload(downloadContent, filename, mimeType, isBase64);
        return;
      }
    } catch (readErr) {
      console.warn('Failed to read file from virtual FS:', readErr);
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (url.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: options?.dialogTitle || '分享',
          text: options?.dialogTitle,
          url: url.startsWith('http') ? url : undefined,
        });
        return;
      } catch (e) {
        console.warn('navigator.share failed', e);
      }
    }
  } catch (e) {
    console.warn('shareAsync failed on web', e);
  }
};

export default { isAvailableAsync, shareAsync };
