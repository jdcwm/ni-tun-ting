export const setStringAsync = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn('Clipboard write failed', e);
    return false;
  }
};
export const getStringAsync = async () => {
  try {
    return await navigator.clipboard.readText();
  } catch (e) {
    console.warn('Clipboard read failed', e);
    return '';
  }
};
export const setImageAsync = async () => {
  console.warn('setImageAsync not supported on web');
  return false;
};
export const hasStringAsync = async () => true;
export const hasImageAsync = async () => false;
export const addClipboardListener = () => ({ remove: () => {} });
export const removeAllClipboardListeners = () => {};
export default {
  setStringAsync,
  getStringAsync,
  setImageAsync,
  hasStringAsync,
  hasImageAsync,
  addClipboardListener,
  removeAllClipboardListeners,
};
