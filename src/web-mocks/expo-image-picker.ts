export const requestMediaLibraryPermissionsAsync = async () => ({ status: 'granted', granted: true });
export const requestCameraPermissionsAsync = async () => ({ status: 'granted', granted: true });
export const getMediaLibraryPermissionsAsync = async () => ({ status: 'granted', granted: true });
export const getCameraPermissionsAsync = async () => ({ status: 'granted', granted: true });

export const launchImageLibraryAsync = async (options?: any) => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (options?.allowsMultipleSelection) {
      input.multiple = true;
    }
    input.onchange = (e: any) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            canceled: false,
            assets: [{
              uri: reader.result as string,
              width: 0,
              height: 0,
              fileName: file.name,
              fileSize: file.size,
              type: file.type,
            }],
          });
        };
        reader.readAsDataURL(file);
      } else {
        resolve({ canceled: true, assets: [] });
      }
    };
    input.click();
  });
};

export const launchCameraAsync = async (options?: any) => {
  console.warn('launchCameraAsync not fully supported on web');
  return launchImageLibraryAsync(options);
};

export default {
  requestMediaLibraryPermissionsAsync,
  requestCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  getCameraPermissionsAsync,
  launchImageLibraryAsync,
  launchCameraAsync,
};
