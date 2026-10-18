// 都道府县与地区。real = 实际参加夏季大会的大致校数
export type RegionId = 'hokkaido' | 'tohoku' | 'kanto' | 'tokyo' | 'hokushinetsu' | 'tokai' | 'kinki' | 'chugoku' | 'shikoku' | 'kyushu';

export interface RegionDef {
  id: RegionId;
  name: string;
  tourName: string; // 秋季地区大会名称
  senbatsu: number; // 选拔一般名额
  fallSlots: number; // 每县晋级地区大会名额
}

export const REGIONS: readonly RegionDef[] = [
  { id: 'hokkaido', name: '北海道', tourName: '秋季北海道大会', senbatsu: 1, fallSlots: 0 },
  { id: 'tohoku', name: '东北', tourName: '秋季东北大会', senbatsu: 3, fallSlots: 2 },
  { id: 'kanto', name: '关东', tourName: '秋季关东大会', senbatsu: 5, fallSlots: 2 },
  { id: 'tokyo', name: '东京', tourName: '秋季东京都大会', senbatsu: 1, fallSlots: 0 },
  { id: 'hokushinetsu', name: '北信越', tourName: '秋季北信越大会', senbatsu: 2, fallSlots: 2 },
  { id: 'tokai', name: '东海', tourName: '秋季东海大会', senbatsu: 3, fallSlots: 3 },
  { id: 'kinki', name: '近畿', tourName: '秋季近畿大会', senbatsu: 6, fallSlots: 3 },
  { id: 'chugoku', name: '中国', tourName: '秋季中国大会', senbatsu: 2, fallSlots: 2 },
  { id: 'shikoku', name: '四国', tourName: '秋季四国大会', senbatsu: 2, fallSlots: 3 },
  { id: 'kyushu', name: '九州', tourName: '秋季九州大会', senbatsu: 4, fallSlots: 2 },
];

export const REGION_BY_ID: Record<RegionId, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionDef>;

export interface PrefDef {
  id: number;
  name: string;
  region: RegionId;
  real: number;
  cities: readonly string[];
  districts?: readonly [string, string];
}

const P = (id: number, name: string, region: RegionId, real: number, cities: string, districts?: [string, string]): PrefDef => ({
  id, name, region, real, cities: cities.split(' '), districts,
});

export const PREFS: readonly PrefDef[] = [
  P(0, '北海道', 'hokkaido', 200, '札幌 旭川 函馆 钏路 带广 小樽 苫小牧 北见 室兰 江别', ['北北海道', '南北海道']),
  P(1, '青森', 'tohoku', 55, '青森 八户 弘前 十和田 五所川原'),
  P(2, '岩手', 'tohoku', 60, '盛冈 花卷 一关 北上 宫古'),
  P(3, '宫城', 'tohoku', 65, '仙台 石卷 古川 盐釜 白石'),
  P(4, '秋田', 'tohoku', 43, '秋田 能代 横手 大馆 本庄'),
  P(5, '山形', 'tohoku', 45, '山形 鹤冈 酒田 米泽 新庄'),
  P(6, '福岛', 'tohoku', 70, '福岛 郡山 磐城 会津 白河'),
  P(7, '茨城', 'kanto', 90, '水户 土浦 日立 筑波 古河 鹿岛'),
  P(8, '栃木', 'kanto', 58, '宇都宫 足利 小山 佐野 鹿沼'),
  P(9, '群马', 'kanto', 63, '前桥 高崎 桐生 太田 伊势崎'),
  P(10, '埼玉', 'kanto', 145, '浦和 大宫 川越 所泽 熊谷 春日部 川口'),
  P(11, '千叶', 'kanto', 155, '千叶 船桥 柏 市川 木更津 成田 松户'),
  P(12, '神奈川', 'kanto', 175, '横滨 川崎 相模原 横须贺 藤泽 平塚 小田原'),
  P(13, '山梨', 'kanto', 33, '甲府 富士吉田 都留 韭崎'),
  P(14, '东京', 'tokyo', 255, '八王子 町田 府中 立川 世田谷 练马 足立 江户川 品川 板桥 调布 武藏野', ['东东京', '西东京']),
  P(15, '新潟', 'hokushinetsu', 70, '新潟 长冈 上越 新发田 柏崎'),
  P(16, '长野', 'hokushinetsu', 80, '长野 松本 上田 饭田 佐久'),
  P(17, '富山', 'hokushinetsu', 43, '富山 高冈 鱼津 砺波'),
  P(18, '石川', 'hokushinetsu', 44, '金泽 小松 七尾 加贺'),
  P(19, '福井', 'hokushinetsu', 28, '福井 敦贺 坂井 小浜'),
  P(20, '静冈', 'tokai', 108, '静冈 滨松 沼津 富士 掛川'),
  P(21, '爱知', 'tokai', 175, '名古屋 丰田 冈崎 一宫 丰桥 春日井'),
  P(22, '岐阜', 'tokai', 64, '岐阜 大垣 多治见 高山 关'),
  P(23, '三重', 'tokai', 58, '津 四日市 伊势 松阪 铃鹿'),
  P(24, '滋贺', 'kinki', 49, '大津 彦根 草津 近江八幡'),
  P(25, '京都', 'kinki', 70, '京都 宇治 福知山 舞鹤 龟冈'),
  P(26, '大阪', 'kinki', 170, '大阪 堺 东大阪 枚方 丰中 吹田 高槻'),
  P(27, '兵库', 'kinki', 155, '神户 姬路 西宫 尼崎 明石 加古川'),
  P(28, '奈良', 'kinki', 35, '奈良 天理 橿原 生驹 大和郡山'),
  P(29, '和歌山', 'kinki', 37, '和歌山 田边 新宫 海南'),
  P(30, '鸟取', 'chugoku', 23, '鸟取 米子 仓吉 境港'),
  P(31, '岛根', 'chugoku', 38, '松江 出云 滨田 益田'),
  P(32, '冈山', 'chugoku', 57, '冈山 仓敷 津山 玉野'),
  P(33, '广岛', 'chugoku', 85, '广岛 福山 吴 尾道 三原'),
  P(34, '山口', 'chugoku', 53, '山口 下关 宇部 岩国 周南'),
  P(35, '德岛', 'shikoku', 29, '德岛 鸣门 阿南 小松岛'),
  P(36, '香川', 'shikoku', 37, '高松 丸龟 坂出 观音寺'),
  P(37, '爱媛', 'shikoku', 52, '松山 今治 宇和岛 新居滨'),
  P(38, '高知', 'shikoku', 25, '高知 四万十 室户 安艺'),
  P(39, '福冈', 'kyushu', 130, '福冈 北九州 久留米 饭冢 大牟田'),
  P(40, '佐贺', 'kyushu', 37, '佐贺 唐津 伊万里 鸟栖'),
  P(41, '长崎', 'kyushu', 52, '长崎 佐世保 谏早 岛原'),
  P(42, '熊本', 'kyushu', 57, '熊本 八代 天草 玉名'),
  P(43, '大分', 'kyushu', 40, '大分 别府 中津 佐伯'),
  P(44, '宫崎', 'kyushu', 45, '宫崎 都城 延冈 日南'),
  P(45, '鹿儿岛', 'kyushu', 65, '鹿儿岛 鹿屋 川内 雾岛'),
  P(46, '冲绳', 'kyushu', 61, '那霸 冲绳 浦添 名护 宜野湾'),
];

/** 游戏内该县学校数（真实数缩放） */
export function gameSchoolCount(pref: PrefDef): number {
  if (pref.districts) return 64; // 两个夏季地区各 32
  return Math.max(16, Math.min(56, Math.round(pref.real / 2.8)));
}

/** 被动（非主场）县生成的知名校数量 */
export function notableCount(pref: PrefDef): number {
  return pref.districts ? 16 : Math.max(8, Math.min(14, Math.round(pref.real / 10)));
}

/** 春季地区大会所属地区（东京春季参加关东大会） */
export function springRegionOf(region: RegionId): RegionId {
  return region === 'tokyo' ? 'kanto' : region;
}
