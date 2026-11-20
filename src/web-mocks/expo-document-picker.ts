import * as FileSystem from './expo-file-system';

const STORAGE_PREFIX = 'web-fs://documents/';

export const getDocumentAsync = async (options?: any) => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.type) {
      input.accept = Array.isArray(options.type) ? options.type.join(',') : options.type;
    }
    if (options?.multiple) {
      input.multiple = true;
    }

    input.onchange = async (e: any) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        resolve({ canceled: true, assets: [] });
        return;
      }

      const assets = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const content = await readFileAsText(file);
          const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_');
          const fileUri = STORAGE_PREFIX + `import_${Date.now()}_${safeName}`;

          // 存到虚拟文件系统
          try {
            await FileSystem.writeAsStringAsync(fileUri, content);
          } catch (err) {
            console.warn('Failed to write imported file to virtual FS', err);
          }

          assets.push({
            name: file.name,
            size: file.size,
            uri: fileUri,
            mimeType: file.type || 'application/octet-stream',
          });
        } catch (err) {
          console.warn('Failed to read file', err);
        }
      }

      if (assets.length === 0) {
        resolve({ canceled: true, assets: [] });
      } else {
        resolve({
          canceled: false,
          assets,
          // 兼容旧格式
          type: 'success',
          name: assets[0].name,
          size: assets[0].size,
          uri: assets[0].uri,
          mimeType: assets[0].mimeType,
        });
      }
    };

    // 用户取消
    input.oncancel = () => {
      resolve({ canceled: true, assets: [] });
    };

    input.click();
  });
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (file.type.startsWith('image/')) {
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      } else {
        resolve(result);
      }
    };
    reader.onerror = () => reject(reader.error);
    if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.png') || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  });
};

export default { getDocumentAsync };
