import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { generateId } from '../constants/defaults';
import { InlineFile } from '../types';

const FILE_DIRS = {
  CHAT_FILES: 'chat_files',
  WORLD_BOOK_FILES: 'worldbook_files',
  TEMP: 'temp',
};

export const fileService = {
  async ensureDir(dir: string): Promise<string> {
    const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const fullPath = `${documentDir}${dir}`;
    const dirInfo = await FileSystem.getInfoAsync(fullPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
    }
    return fullPath;
  },

  async importFileFromDevice(dir: string = FILE_DIRS.CHAT_FILES): Promise<InlineFile | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) return null;

      const asset = result.assets[0];
      const destDir = await this.ensureDir(dir);
      const ext = asset.name.split('.').pop() || '';
      const fileName = `file_${Date.now()}.${ext}`;
      const destUri = `${destDir}/${fileName}`;

      await FileSystem.copyAsync({ from: asset.uri, to: destUri });

      const fileInfo = await FileSystem.getInfoAsync(destUri);

      return {
        id: generateId(),
        type: this.isImageType(asset.mimeType || '') ? 'image' : 'file',
        name: asset.name,
        uri: destUri,
        mimeType: asset.mimeType,
        size: fileInfo.exists ? fileInfo.size : undefined,
        insertPosition: 0,
      };
    } catch (error) {
      console.error('导入文件失败:', error);
      return null;
    }
  },

  async importMultipleFilesFromDevice(count: number = 5, dir: string = FILE_DIRS.CHAT_FILES): Promise<InlineFile[]> {
    const results: InlineFile[] = [];
    for (let i = 0; i < count; i++) {
      const file = await this.importFileFromDevice(dir);
      if (file) {
        results.push(file);
      }
    }
    return results;
  },

  async importImageFromGallery(): Promise<InlineFile | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) return null;

      const asset = result.assets[0];
      const destDir = await this.ensureDir(FILE_DIRS.CHAT_FILES);
      const ext = asset.name.split('.').pop() || 'jpg';
      const fileName = `img_${Date.now()}.${ext}`;
      const destUri = `${destDir}/${fileName}`;

      await FileSystem.copyAsync({ from: asset.uri, to: destUri });
      const fileInfo = await FileSystem.getInfoAsync(destUri);

      return {
        id: generateId(),
        type: 'image',
        name: asset.name,
        uri: destUri,
        mimeType: asset.mimeType,
        size: fileInfo.exists ? fileInfo.size : undefined,
        insertPosition: 0,
      };
    } catch (error) {
      console.error('导入图片失败:', error);
      return null;
    }
  },

  async deleteFile(uri: string): Promise<void> {
    try {
      if (uri.startsWith('file://')) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (error) {
      console.error('删除文件失败:', error);
    }
  },

  async getFileInfo(uri: string): Promise<FileSystem.FileInfo | null> {
    try {
      return await FileSystem.getInfoAsync(uri);
    } catch (error) {
      console.error('获取文件信息失败:', error);
      return null;
    }
  },

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },

  isImageType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  },

  isTextType(mimeType: string): boolean {
    return mimeType.startsWith('text/') || 
           mimeType === 'application/json' ||
           mimeType === 'application/xml' ||
           mimeType === 'application/pdf';
  },

  getFileIcon(type: string): string {
    if (type.startsWith('image/')) return '📷';
    if (type.includes('pdf')) return '📕';
    if (type.includes('word') || type.includes('doc')) return '📘';
    if (type.includes('excel') || type.includes('sheet')) return '📗';
    if (type.includes('powerpoint') || type.includes('ppt')) return '📙';
    if (type.includes('video')) return '🎬';
    if (type.includes('audio')) return '🎵';
    if (type.startsWith('text/')) return '📄';
    return '📎';
  },

  insertFileIntoContent(content: string, file: InlineFile, position: number): { content: string; file: InlineFile } {
    const filePlaceholder = `[文件:${file.id}]`;
    const newContent = content.slice(0, position) + filePlaceholder + content.slice(position);
    return {
      content: newContent,
      file: { ...file, insertPosition: position },
    };
  },

  parseContentWithFiles(content: string, files: InlineFile[]): { text: string; files: { file: InlineFile; position: number }[] } {
    const fileMarkers: { file: InlineFile; position: number }[] = [];
    let remainingContent = content;
    let offset = 0;

    files.forEach((file) => {
      const marker = `[文件:${file.id}]`;
      const index = remainingContent.indexOf(marker);
      if (index !== -1) {
        fileMarkers.push({ file, position: index + offset });
        offset += index + marker.length;
        remainingContent = remainingContent.slice(index + marker.length);
      }
    });

    fileMarkers.sort((a, b) => a.position - b.position);

    return {
      text: content.replace(/\[文件:[^\]]+\]/g, ''),
      files: fileMarkers,
    };
  },

  async saveFileToAppDir(sourceUri: string, fileName: string, dir: string = FILE_DIRS.CHAT_FILES): Promise<string> {
    try {
      const destDir = await this.ensureDir(dir);
      const destUri = `${destDir}/${fileName}`;
      await FileSystem.copyAsync({ from: sourceUri, to: destUri });
      return destUri;
    } catch (error) {
      console.error('保存文件失败:', error);
      return sourceUri;
    }
  },

  async saveTextFile(content: string, fileName: string, dir: string = FILE_DIRS.CHAT_FILES): Promise<string> {
    try {
      const destDir = await this.ensureDir(dir);
      const destUri = `${destDir}/${fileName}`;
      await FileSystem.writeAsStringAsync(destUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return destUri;
    } catch (error) {
      console.error('保存文本文件失败:', error);
      throw error;
    }
  },
};
