import React from 'react';

export const captureRef = async (viewRef: any, options?: any): Promise<string> => {
  console.warn('captureRef not supported on web');
  return '';
};
export const captureScreen = async (options?: any): Promise<string> => {
  console.warn('captureScreen not supported on web');
  return '';
};
export const ViewShot = React.forwardRef((props: any, ref) => {
  return React.createElement('div', { ref, ...props }, props.children);
});
export default { captureRef, captureScreen, ViewShot };
