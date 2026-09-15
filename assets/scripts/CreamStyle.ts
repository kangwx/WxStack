export type RGB = readonly [number, number, number];
export type CreamVariant = 'standard' | 'bright';

/** Shared cream UI and the original, standard toy-world palette. */
export const CREAM_STYLE = {
  backgroundColor: [255, 243, 226] as RGB,
  shadow: [183, 151, 142] as RGB,
  titleColor: [83, 67, 78] as RGB,
  textColor: [83, 67, 78] as RGB,
  mutedColor: [105, 86, 94] as RGB,
  accentColor: [171, 233, 207] as RGB,
  secondaryAccentColor: [231, 216, 247] as RGB,
  panelColor: [255, 254, 248] as RGB,
  buttonColor: [255, 225, 222] as RGB,
  blockPalette: [
    [158, 216, 208], [187, 226, 183], [241, 229, 157], [249, 212, 174],
    [242, 186, 194], [213, 189, 232], [187, 201, 236], [169, 220, 235],
  ] as readonly RGB[],
  stageShadow: [229, 204, 184] as RGB,
  tableEdge: [250, 204, 198] as RGB,
  tableTop: [255, 247, 218] as RGB,
  plinth: [251, 237, 215] as RGB,
  toyInlay: [255, 252, 237] as RGB,
} as const;

export type CreamWorldPalette = Pick<typeof CREAM_STYLE,
  'blockPalette' | 'stageShadow' | 'tableEdge' | 'tableTop' | 'plinth' | 'toyInlay'>;

/** Vivid candy-painted toys; the cream background and UI stay the same. */
export const CREAM_BRIGHT_WORLD: CreamWorldPalette = {
  blockPalette: [
    [65, 224, 174], [139, 225, 72], [255, 220, 58], [255, 169, 83],
    [255, 112, 151], [184, 125, 246], [105, 159, 255], [62, 210, 242],
  ],
  stageShadow: [240, 219, 201],
  tableEdge: [255, 167, 172],
  tableTop: [255, 254, 237],
  plinth: [255, 249, 231],
  toyInlay: [255, 255, 247],
};

// Unlit colors still pass through Cocos HDR/ACES. Raising RGB alone barely
// brightens the tray; scaling linear color lifts its side faces and bevels too.
export const CREAM_BRIGHT_COLOR_SCALE = 2.3;
