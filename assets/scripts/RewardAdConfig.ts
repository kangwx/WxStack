/** Holatek API configuration. Scene IDs must be supplied by the ad platform. */
export const AD_REWARD_CONFIG = {
  baseUrl: 'https://store.app.holatek.cn',
  gameId: 'gm0c9bfa4495724696',
  sceneIds: {
    extraReward: 'EnergyRecovery', // 体力恢复广告位
    doubleReward: '', // TODO: 双倍奖励广告位 ID（启用此入口时填写）
    revive: 'Revive', // 复活广告位
  },
  testSceneId: '', // TODO: 可选测试广告位，配置后覆盖入口映射
  testUserId: '',
  sn: '', // Optional Android device SN; never collect it implicitly.
  poll: {
    initialDelayMs: 15000,
    durationMs: 180000,
    intervalMs: 2000,
    maxIntervalMs: 8000,
    maxConsecutiveErrors: 4,
  },
};
export const AD_ENTRY_POINTS = {
  MAIN_MENU: 'MAIN_MENU', SETTLEMENT: 'SETTLEMENT', SETTLEMENT_DOUBLE: 'SETTLEMENT_DOUBLE',
  REVIVE: 'REVIVE', SHOP_BONUS: 'SHOP_BONUS',
} as const;
export const AD_PENDING_ACTIONS = {
  EXTRA_GOLD: 'EXTRA_GOLD', DOUBLE_GOLD: 'DOUBLE_GOLD', REVIVE: 'REVIVE', ITEM_REWARD: 'ITEM_REWARD',
} as const;
export type AdEntryPoint = typeof AD_ENTRY_POINTS[keyof typeof AD_ENTRY_POINTS];
export type AdPendingAction = typeof AD_PENDING_ACTIONS[keyof typeof AD_PENDING_ACTIONS];
