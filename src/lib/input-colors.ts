import type { TextInputProps } from 'react-native';

/** Couleurs explicites : les écrans sont clairs, le texte saisi ne doit jamais dépendre du thème système. */
export const INPUT_TEXT_COLOR = '#222';
export const INPUT_BACKGROUND = '#fff';

export const INPUT_PROPS: TextInputProps = {
  placeholderTextColor: '#999',
  cursorColor: '#007AFF',
  selectionColor: '#007AFF',
  underlineColorAndroid: 'transparent',
};
