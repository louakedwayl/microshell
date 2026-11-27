import { Platform } from 'react-native';

export const colors = {
  background: '#0b0e11',
  surface: '#11161b',
  elevated: '#181e25',
  border: '#273039',
  text: '#e5e9ed',
  muted: '#99a5b1',
  subtle: '#667380',
  accent: '#c2f970',
  accentDim: '#23321d',
  danger: '#ff8989',
  warning: '#e6be76',
};
export const fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};
