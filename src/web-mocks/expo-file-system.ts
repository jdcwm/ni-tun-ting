export const documentDirectory = 'web-fs://documents/';
export const cacheDirectory = 'web-fs://cache/';
export const bundleDirectory = 'web-fs://bundle/';

export const EncodingType = {
  Base64: 'base64',
  UTF8: 'utf8',
};

const storage = typeof localStorage !== 'undefined' ? localStorage : ({} as any);

const isBase64 = (options?: any): boolean => {
  if (!options || !options.encoding) return false;
  if (typeof options.encoding === 'string') {
    return options.encoding.toLowerCase() === 'base64';
  }
  return false;
};

export const getInfoAsync = async (uri: string, options?: any) => {
  try {
    const data = storage.getItem(uri);
    if (data) {
      return { exists: true, isDirectory: false, size: data.length, uri };
    }
    return { exists: false, isDirectory: false, uri };
  } catch (e) {
    return { exists: false, isDirectory: false, uri };
  }
};

export const readAsStringAsync = async (uri: string, options?: any) => {
  try {
    const data = storage.getItem(uri);
    if (data) {
      if (isBase64(options)) {
        const prefix = 'base64:';
        if (data.startsWith(prefix)) {
          return data.substring(prefix.length);
        }
        if (typeof window !== 'undefined') {
          try {
            return btoa(unescape(encodeURIComponent(data)));
          } catch {
            return data;
          }
        }
      }
      return data;
    }
    throw new Error('File not found');
  } catch (e) {
    throw e;
  }
};

export const writeAsStringAsync = async (uri: string, content: string, options?: any) => {
  try {
    if (isBase64(options)) {
      storage.setItem(uri, 'base64:' + content);
    } else {
      storage.setItem(uri, content);
    }
  } catch (e) {
    console.warn('writeAsStringAsync failed', e);
  }
};

export const deleteAsync = async (uri: string, options?: any) => {
  try {
    storage.removeItem(uri);
  } catch (e) {
    console.warn('deleteAsync failed', e);
  }
};

export const makeDirectoryAsync = async (uri: string, options?: any) => {
  try {
    storage.setItem(uri + '__dir__', '1');
  } catch (e) {
    console.warn('makeDirectoryAsync failed', e);
  }
};

export const copyAsync = async (options: any) => {
  try {
    const data = storage.getItem(options.from);
    if (data) {
      storage.setItem(options.to, data);
    }
  } catch (e) {
    console.warn('copyAsync failed', e);
  }
};

export const moveAsync = async (options: any) => {
  try {
    const data = storage.getItem(options.from);
    if (data) {
      storage.setItem(options.to, data);
      storage.removeItem(options.from);
    }
  } catch (e) {
    console.warn('moveAsync failed', e);
  }
};

export const readDirectoryAsync = async (uri: string) => {
  return [];
};

export const getContentUriAsync = async (uri: string) => uri;

export const downloadAsync = async (uri: string, fileUri: string, options?: any) => {
  return { uri: fileUri, status: 200, headers: {} };
};

export const uploadAsync = async (fileUri: string, url: string, options?: any) => {
  return { uri: url, status: 200, headers: {}, body: '' };
};

export default {
  documentDirectory,
  cacheDirectory,
  bundleDirectory,
  EncodingType,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  makeDirectoryAsync,
  copyAsync,
  moveAsync,
  readDirectoryAsync,
  getContentUriAsync,
  downloadAsync,
  uploadAsync,
};
