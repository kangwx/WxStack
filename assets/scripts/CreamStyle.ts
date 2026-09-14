export type RGB = readonly [number, number, number];

/** The single palette shared by the game UI and the cream toy world. */
export const CREAM_STYLE = {
  backgroundColor: [210, 188, 181] as RGB,
  shadow: [133, 104, 106] as RGB,
  titleColor: [83, 67, 78] as RGB,
  textColor: [83, 67, 78] as RGB,
  mutedColor: [105, 86, 94] as RGB,
  accentColor: [174, 207, 197] as RGB,
  secondaryAccentColor: [201, 187, 214] as RGB,
  panelColor: [255, 248, 231] as RGB,
  buttonColor: [234, 215, 218] as RGB,
  blockPalette: [
    [153, 199, 199], [179, 211, 178], [222, 217, 153], [236, 200, 161],
    [225, 175, 180], [197, 177, 208], [175, 185, 214], [161, 203, 214],
  ] as readonly RGB[],
  stageShadow: [181, 156, 150] as RGB,
  tableEdge: [223, 175, 181] as RGB,
  tableTop: [247, 232, 193] as RGB,
  plinth: [224, 210, 191] as RGB,
  toyInlay: [251, 240, 207] as RGB,
} as const;
