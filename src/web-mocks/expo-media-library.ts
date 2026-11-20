export const requestPermissionsAsync = async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' });
export const getPermissionsAsync = async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' });
export const saveToLibraryAsync = async (uri: string) => {
  try {
    const link = document.createElement('a');
    link.href = uri;
    link.download = 'image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.warn('saveToLibraryAsync not supported on web', e);
  }
};
export const createAssetAsync = async (localUri: string) => ({ localUri, assetId: 'web-asset' });
export const getAlbumsAsync = async () => [];
export const createAlbumAsync = async (albumName: string, asset: any) => ({ title: albumName, id: 'web-album' });
export default {
  requestPermissionsAsync,
  getPermissionsAsync,
  saveToLibraryAsync,
  createAssetAsync,
  getAlbumsAsync,
  createAlbumAsync,
};
