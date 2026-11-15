import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { loadConfig, type AppConfig } from './server/config';
import { createAuthMiddleware } from './server/auth/middleware';
import { createAuthRouter } from './server/auth/routes';
import { SessionManager } from './server/auth/sessions';
import { migrateAuthFields, DEMO_USER_IDS } from './server/auth/migrate';
import { hashPassword } from './server/auth/password';
import { toPublicSeller, toSelfUser } from './server/auth/serialize';
import {
  canAccessConversation,
  canDeleteComment,
  canEditComment,
  canEditListing,
  canLikeListing,
  canReplyToListingComment,
  canRespondToOffer,
  canViewListing,
  canViewListingComments,
  isAdmin,
  visibleConversations,
  visibleOffers,
} from './server/auth/policy';
import { createRealtime } from './server/realtime';
import { loadEnvForEntryPoint } from './server/env';
import { acquireStoreLock, appendAuditArchive, resolveDataDir, STORE_FILE_NAME, StorePersister } from './server/storage';
import { RateLimiter } from './server/auth/rateLimit';
import {
  CommentValidationError,
  isDuplicateRecentComment,
  normalizeAndValidateCommentBody,
  paginateListingThreads,
  toPublicComment,
  type CommentRecord,
} from './server/comments';
import {
  applyListingLikeMutation,
  attachLikesCountToListing,
  getListingLikesCount,
  getUserLikedListingIds,
  hasUserLikedListing,
  LikeValidationError,
  normalizeLikeNotificationHistory,
  normalizeLikesStore,
  parseLikeAction,
  recordLikeNotification,
  shouldSendLikeNotification,
  type LikeAction,
  type LikeNotificationHistory,
  type LikesMap,
} from './server/likes';
import {
  listingMatchesCity,
  listingMatchesSearchQuery,
  sortListingsDeterministic,
  validateAndParseListingQuery,
} from './src/lib/listing-search';
import {
  cleanupOrphanedDraftMedia,
  extractMediaIdFromUrl,
  MAX_IMAGE_BYTES,
  MAX_UNBOUND_MEDIA_PER_USER,
  MAX_VIDEO_BYTES,
  MediaUploadError,
  parseUploadRequest,
  removeMediaFile,
  resolveListingMedia,
  resolveSafeMediaPath,
  storeUploadedMedia,
  toPublicMedia,
  type MediaAsset,
} from './server/media';
import {
  AdminValidationError,
  applySellerVerificationDecision,
  applyUserReactivation,
  applyUserSuspension,
  buildAdminOverview,
  createAuditLogEntry,
  filterAdminUsers,
  normalizeReportRecord,
  normalizeSellerVerificationFields,
  paginateAdminItems,
  resolveSellerVerificationStatus,
  toAdminReportItem,
  toAdminUserSummary,
  validateAdminNote,
} from './server/admin';
import type { Credential } from './server/auth/types';
import type { SessionRecord } from './server/auth/sessions';
import { toUserConversation } from './server/conversations';
import { hasMaterialListingChanges, validateExpectedPriceRule } from './src/lib/listing-validation';
import {
  INPUT_LIMITS,
  parseAndValidateKeywords,
  parseFinitePositiveNumber,
  parsePositiveInteger,
  validateCategoryParentAssignment,
  validateOptionalText,
  validateRequiredText,
  ValidationError,
} from './server/validation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Where one server instance keeps its data. It is created per startServer() call and passed explicitly:
 * there is deliberately NO module-level DATA_DIR / STORE_PATH, so two instances in one process
 * (integration tests, tooling) can never write into each other's store.
 */
interface StorePaths {
  readonly dataDir: string;
  readonly storePath: string;
  readonly uploadsDir: string;
}

function makeStorePaths(dataDir: string): StorePaths {
  return {
    dataDir,
    storePath: path.join(dataDir, STORE_FILE_NAME),
    uploadsDir: path.join(dataDir, 'uploads'),
  };
}

interface StoreData {
  users: any[];
  sellers: any[];
  categories: any[];
  breeds: any[];
  regions: any[];
  listings: any[];
  favorites: Record<string, string[]>;
  likes: LikesMap;
  likeNotificationHistory: LikeNotificationHistory;
  conversations: any[];
  priceOffers: any[];
  notifications: any[];
  sellerReviews: any[];
  reports: any[];
  indicativePrices: any[];
  articles: any[];
  faqs: any[];
  auditLogs: any[];
  comments: CommentRecord[];
  media: MediaAsset[];
  /** Argon2id password hashes, one per account that can sign in. Never sent to clients. */
  credentials: Credential[];
  /** Server-side sessions (only SHA-256 hashes of the cookie tokens are stored). */
  sessions: SessionRecord[];
}

const IMG = {
  hero: '/src/assets/images/hero_saudi_livestock_1794608168927.jpg',
  naimi: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg',
  najdi: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg',
  harri: '/src/assets/images/breed_harri_sheep_1794608169989.jpg',
  ardhi: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg',
  sawakni: '/src/assets/images/breed_sawakni_camels_1794608171012.jpg',
};

function createSeedData(): StoreData {
  const now = new Date('2026-11-13T12:00:00Z').getTime();
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

  const users = [
    {
      id: 'usr_seller_1',
      phone: '0504829104',
      email: 'fahad@alqahtani-farm.sa',
      name: 'فهد القحطاني',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(720),
    },
    {
      id: 'usr_seller_2',
      phone: '0559134287',
      email: 'abdulrahman@najd-herds.sa',
      name: 'عبدالرحمن الدوسري',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(960),
    },
    {
      id: 'usr_seller_3',
      phone: '0547201833',
      email: 'salem@hijaz-livestock.sa',
      name: 'سالم الحربي',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(600),
    },
    {
      id: 'usr_buyer_1',
      phone: '0561940281',
      email: 'khalid@riyadh.sa',
      name: 'خالد السبيعي',
      role: 'buyer',
      status: 'active',
      createdAt: hoursAgo(300),
    },
    {
      id: 'usr_admin_1',
      phone: '0500000001',
      email: 'admin@souqalghanam.sa',
      name: 'إدارة المنصة',
      role: 'admin',
      status: 'active',
      createdAt: hoursAgo(2000),
    },
  ];

  const sellers = [
    {
      userId: 'usr_seller_1',
      displayName: 'مراح القحطاني للنعيمي الفاخر',
      bio: 'مربٍ متخصص في سلالات النعيمي النجدية والشمالية منذ أكثر من 18 عاماً، مع التزام تام بالتحصين البيطري والتغذية الطبيعية.',
      regionId: 'reg_riyadh',
      city: 'الرياض — المزاحمية',
      phone: '0504829104',
      whatsapp: '966504829104',
      verificationStatus: 'Verified',
      verifiedAt: hoursAgo(500),
      verificationNote: null,
      verificationRequestedAt: hoursAgo(520),
      verificationReviewedAt: hoursAgo(500),
      yearsExperience: 18,
      specialty: 'نعيمي ونجدي',
      rating: 4.8,
      ratingCount: 2,
      totalSales: 142,
    },
    {
      userId: 'usr_seller_2',
      displayName: 'مزارع الدوسري للسلالات النجدية والعارضية',
      bio: 'إنتاج وتأصيل الفحول النجدية والماعز العارضي الصنف في منطقة القصيم والخرج، مع شهادة صحية لكل رأس.',
      regionId: 'reg_qassim',
      city: 'بريدة — القصيم',
      phone: '0559134287',
      whatsapp: '966559134287',
      verificationStatus: 'Verified',
      verifiedAt: hoursAgo(800),
      verificationNote: null,
      verificationRequestedAt: hoursAgo(820),
      verificationReviewedAt: hoursAgo(800),
      yearsExperience: 14,
      specialty: 'نجدي وعارضي',
      rating: 4.5,
      ratingCount: 2,
      totalSales: 98,
    },
    {
      userId: 'usr_seller_3',
      displayName: 'حظائر الحربي للحري والسواكني',
      bio: 'توفير أجود أنواع الحري البلدي والسواكني المربى محلياً للمناسبات والذبائح والتربية في منطقة مكة المكرمة والطائف.',
      regionId: 'reg_makkah',
      city: 'الطائف — مكة المكرمة',
      phone: '0547201833',
      whatsapp: '966547201833',
      verificationStatus: 'Verified',
      verifiedAt: hoursAgo(400),
      verificationNote: null,
      verificationRequestedAt: hoursAgo(410),
      verificationReviewedAt: hoursAgo(400),
      yearsExperience: 11,
      specialty: 'حري وسواكني',
      rating: 5.0,
      ratingCount: 1,
      totalSales: 176,
    },
  ];

  const categories = [
    { id: 'cat_sheep', name: 'الأغنام', slug: 'sheep', parentId: null },
    { id: 'cat_goats', name: 'الماعز', slug: 'goats', parentId: null },
    { id: 'cat_breeding', name: 'فحول الإنتاج', slug: 'breeding-rams', parentId: null },
    {
      id: 'sub_slaughter',
      name: 'ذبائح',
      slug: 'slaughter',
      parentId: 'cat_sheep',
      description: 'أغنام وماعز جاهزة للذبح والمناسبات والأضاحي',
      keywords: ['جذعان', 'هرفي', 'بهم', 'طليان', 'ذبيحة', 'ذبائح', 'ولائم', 'عزائم', 'مناسبات'],
    },
    {
      id: 'sub_breeding',
      name: 'مواشي للتربية',
      slug: 'for-breeding',
      parentId: 'cat_sheep',
      description: 'إناث دفيع ومتابيع وقطيع إنتاج للتربية والتكاثر',
      keywords: ['رخال', 'دفيع', 'متابيع', 'حلوب', 'مضاريع', 'مقاريب', 'تربية', 'جفرتين'],
    },
    {
      id: 'sub_show',
      name: 'مواشي للعرض',
      slug: 'for-show',
      parentId: 'cat_breeding',
      description: 'فحول صنف وسلالات فاخرة للعرض والإنتاج المميز',
      keywords: ['فحل', 'صنف', 'فاخر', 'ناهي', 'أبرص', 'عرض', 'أصل وفصل', 'نسف'],
    },
  ];

  const breeds = [
    {
      id: 'brd_naimi',
      categoryId: 'cat_sheep',
      name: 'نعيمي',
      slug: 'naimi',
      origin: 'نجد والشمال',
      summary: 'السلالة الأكثر طلباً في المملكة للذبائح والمناسبات، تمتاز بجودة اللحم وتوازن الدهن وقدرتها العالية على التكيف.',
      avgWeightKg: '38 – 65 كجم',
      priceRangeSar: '1,450 – 2,400 ر.س',
      imageUrl: IMG.naimi,
      characteristics: ['رأس بني محمر وصوف أبيض كثيف', 'تتحمل أجواء الصحراء والبرد', 'نسبة تصافي لحم مرتفعة'],
    },
    {
      id: 'brd_najdi',
      categoryId: 'cat_sheep',
      name: 'نجدي',
      slug: 'najdi',
      origin: 'وسط المملكة (نجد)',
      summary: 'أيقونة المواشي النجدية الأصيلة، معروفة بقامتها الطويلة وشعرها الأسود اللامع وأنفها المقوّس وقيمتها العالية لدى المربين.',
      avgWeightKg: '42 – 72 كجم',
      priceRangeSar: '1,650 – 3,500 ر.س',
      imageUrl: IMG.najdi,
      characteristics: ['لون أسود حالك مع بياض في الوجه والأطراف', 'مناسبة جداً للتربية والإنتاج الفاخر', 'خصوبة عالية ومقاومة للجفاف'],
    },
    {
      id: 'brd_harri',
      categoryId: 'cat_sheep',
      name: 'حري',
      slug: 'harri',
      origin: 'الحجاز والساحل الغربي',
      summary: 'سلالة حجازية عريقة تشتهر بلحمها الطري ونموها السريع، وتحظى بإقبال كبير في مكة وجدة والطائف.',
      avgWeightKg: '32 – 52 كجم',
      priceRangeSar: '1,250 – 1,950 ر.س',
      imageUrl: IMG.harri,
      characteristics: ['لون أبيض ناصع وصوف ناعم متوسط', 'لحم خفيف الدهون ومذاق مميز', 'معدلات توأم عالية'],
    },
    {
      id: 'brd_ardhi',
      categoryId: 'cat_goats',
      name: 'عارضي',
      slug: 'ardhi',
      origin: 'هضبة نجد والعارض',
      summary: 'الماعز السعودي الأصيل المفضّل للإنتاج والزينة، يمتاز بالأذنين الطويلتين والهيكل القوي والقدرة الممتازة على إدرار الحليب.',
      avgWeightKg: '35 – 60 كجم',
      priceRangeSar: '1,100 – 2,800 ر.س',
      imageUrl: IMG.ardhi,
      characteristics: ['شعر أسود لامع وأذنان طويلتان متدليتان', 'مقاوم للحرارة وقلة المرعى', 'مطلوب لفحول الصنف والتربية'],
    },
    {
      id: 'brd_sawakni',
      categoryId: 'cat_sheep',
      name: 'سواكني',
      slug: 'sawakni',
      origin: 'مربى محلياً',
      summary: 'خيار اقتصادي عملي للولائم والعقود الغذائية، يمتاز بوفرة اللحم وانخفاض الشحم خاصة عند تربيته وتغذيته محلياً.',
      avgWeightKg: '40 – 62 كجم',
      priceRangeSar: '950 – 1,450 ر.س',
      imageUrl: IMG.sawakni,
      characteristics: ['غطاء قصير بلون بني أو أحمر فاتح', 'وزن لحم صافٍ مرتفع', 'سعر اقتصادي للمناسبات الكبيرة'],
    },
  ];

  const regions = [
    { id: 'reg_riyadh', name: 'الرياض', parentId: null },
    { id: 'reg_makkah', name: 'مكة المكرمة', parentId: null },
    { id: 'reg_eastern', name: 'المنطقة الشرقية', parentId: null },
    { id: 'reg_qassim', name: 'القصيم', parentId: null },
    { id: 'reg_madinah', name: 'المدينة المنورة', parentId: null },
    { id: 'reg_asir', name: 'عسير', parentId: null },
    { id: 'reg_hail', name: 'حائل', parentId: null },
    { id: 'reg_tabuk', name: 'تبوك', parentId: null },
  ];

  const listings = [
    {
      id: 'lst_101',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'المزاحمية',
      title: 'جذعان نعيمي بلدي تربية مراح شرط الصحة والنظافة',
      slug: 'naimi-lambs-riyadh-101',
      description: 'عدد 12 رأس جذعان نعيمي بلدي تربية مراح خاص في المزاحمية، التغذية على الشعير والبرسيم الصافي، محصنة دموي ومعوي، أوزان طيبة وتصلح للذبائح والمناسبات.',
      priceAmount: 1850,
      expectedPrice: 1750,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 8,
      weightKg: 46,
      quantity: 12,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(2),
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(2),
      isFeatured: true,
      images: [
        { id: 'img_101_1', url: IMG.naimi, position: 1 },
        { id: 'img_101_2', url: IMG.hero, position: 2 },
      ],
    },
    {
      id: 'lst_102',
      sellerId: 'usr_seller_2',
      categoryId: 'cat_breeding',
      subCategoryId: 'sub_show',
      breedId: 'brd_najdi',
      regionId: 'reg_qassim',
      city: 'بريدة',
      title: 'فحل نجدي رباع فاخر سلالة أصيلة شرط النسف',
      slug: 'najdi-ram-qassim-102',
      description: 'فحل نجدي صنف رباع، جرم ناهي، رأس أبرص، شعرة حريرية، منتج وله إنتاج فاخر في المراح، خالٍ من جميع العيوب والأمراض ولله الحمد.',
      priceAmount: 3400,
      expectedPrice: 3150,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 24,
      weightKg: 70,
      quantity: 1,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(5),
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(5),
      isFeatured: true,
      images: [
        { id: 'img_102_1', url: IMG.najdi, position: 1 },
        { id: 'img_102_2', url: IMG.naimi, position: 2 },
      ],
    },
    {
      id: 'lst_103',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_harri',
      regionId: 'reg_makkah',
      city: 'الطائف',
      title: 'بهم حري أعمار 6 إلى 7 أشهر من حلال الطائف',
      slug: 'harri-lambs-taif-103',
      description: 'بهم حري سمان وشحم طيب، رعي طبيعي مع علف مركز، البيع جملة أو تفريد حسب الرغبة مع إمكانية التوصيل داخل مكة وجدة والطائف.',
      priceAmount: 1480,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 38,
      quantity: 20,
      isNegotiable: false,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(9),
      createdAt: hoursAgo(10),
      updatedAt: hoursAgo(9),
      isFeatured: true,
      images: [
        { id: 'img_103_1', url: IMG.harri, position: 1 },
      ],
    },
    {
      id: 'lst_104',
      sellerId: 'usr_seller_2',
      categoryId: 'cat_goats',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_ardhi',
      regionId: 'reg_riyadh',
      city: 'الخرج',
      title: 'تيس عارضي ثني أصل وفصل مع جفرتين دفيع',
      slug: 'ardhi-goat-kharj-104',
      description: 'مجموعة عوارض صنف: تيس ثني جرم طيب وأذن طويلة وجفرتين مضاريع على فحل المراح، سليمة ومحصنة كاملة.',
      priceAmount: 2650,
      currency: 'SAR',
      sex: 'قطيع مختلط',
      ageMonths: 14,
      weightKg: 48,
      quantity: 3,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(14),
      createdAt: hoursAgo(15),
      updatedAt: hoursAgo(14),
      isFeatured: false,
      images: [
        { id: 'img_104_1', url: IMG.ardhi, position: 1 },
      ],
    },
    {
      id: 'lst_105',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_sawakni',
      regionId: 'reg_eastern',
      city: 'الدمام',
      title: 'سواكني مربى في المملكة 5 أشهر نظيف جداً',
      slug: 'sawakni-dammam-105',
      description: 'سواكني تربية محلية لمدة 5 أشهر على البرسيم والشعير، لحم أحمر صافي وخالٍ من الزفر، مناسب للعزائم والمطابخ.',
      priceAmount: 1180,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 11,
      weightKg: 50,
      quantity: 15,
      isNegotiable: false,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(20),
      createdAt: hoursAgo(22),
      updatedAt: hoursAgo(20),
      isFeatured: false,
      images: [
        { id: 'img_105_1', url: IMG.sawakni, position: 1 },
      ],
    },
    {
      id: 'lst_106',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_naimi',
      regionId: 'reg_hail',
      city: 'حائل',
      title: 'رخال نعيميات صنف دفيع مقاريب عدد 8 رؤوس',
      slug: 'naimi-ewes-hail-106',
      description: 'رخال نعيميات جذعات وثنيات مقاريب على فحل من حلال الشمال، أصحاح وأحوال ممتازة والبيع سمح للصامل.',
      priceAmount: 2150,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 15,
      weightKg: 54,
      quantity: 8,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(26),
      createdAt: hoursAgo(28),
      updatedAt: hoursAgo(26),
      isFeatured: false,
      images: [
        { id: 'img_106_1', url: IMG.naimi, position: 1 },
      ],
    },
    {
      id: 'lst_107',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_najdi',
      regionId: 'reg_riyadh',
      city: 'رماح',
      title: 'طليان نجدية جذعان تربية برية — بانتظار المراجعة',
      slug: 'najdi-pending-107',
      description: 'طليان نجدية من إنتاج مراح رماح، مرعى طبيعي مع شعير بلدي، أعمار 7 أشهر ونظيفة تماماً.',
      priceAmount: 1950,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 43,
      quantity: 6,
      isNegotiable: true,
      vaccinated: true,
      status: 'Pending',
      publishedAt: hoursAgo(1),
      createdAt: hoursAgo(1),
      updatedAt: hoursAgo(1),
      isFeatured: false,
      images: [
        { id: 'img_107_1', url: IMG.najdi, position: 1 },
      ],
    },
    {
      id: 'lst_108',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_goats',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_ardhi',
      regionId: 'reg_makkah',
      city: 'جدة',
      title: 'معزا عوارض حلوب متابيع — بانتظار الاعتماد',
      slug: 'ardhi-pending-108',
      description: 'عنزين عوارض معها 3 جفار، حليب وافر وصحة ممتازة ومحصنة ضد الطاعون والدموي.',
      priceAmount: 2300,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 22,
      weightKg: 45,
      quantity: 2,
      isNegotiable: true,
      vaccinated: true,
      status: 'Pending',
      publishedAt: hoursAgo(0.5),
      createdAt: hoursAgo(0.5),
      updatedAt: hoursAgo(0.5),
      isFeatured: false,
      images: [
        { id: 'img_108_1', url: IMG.ardhi, position: 1 },
      ],
    },
  ];

  const favorites: Record<string, string[]> = {
    usr_buyer_1: ['lst_101', 'lst_102'],
    usr_seller_1: ['lst_102'],
    usr_admin_1: ['lst_101'],
  };

  const likes: LikesMap = {
    lst_101: ['usr_buyer_1', 'usr_seller_2'],
    lst_102: ['usr_buyer_1'],
    lst_103: ['usr_seller_1'],
  };

  const likeNotificationHistory: LikeNotificationHistory = {};

  const conversations = [
    {
      id: 'conv_1',
      listingId: 'lst_101',
      buyerId: 'usr_buyer_1',
      sellerId: 'usr_seller_1',
      updatedAt: hoursAgo(1),
      messages: [
        {
          id: 'msg_1',
          conversationId: 'conv_1',
          senderId: 'usr_buyer_1',
          body: 'السلام عليكم، هل الجذعان النعيمي ما زالت متوفرة؟ وكم تحسب لي 4 رؤوس؟',
          createdAt: hoursAgo(1.5),
        },
        {
          id: 'msg_2',
          conversationId: 'conv_1',
          senderId: 'usr_seller_1',
          body: 'وعليكم السلام ورحمة الله، حياك الله يا أبو عبدالله، نعم متوفرة وللأربعة رؤوس نحسبها لك بـ 1,800 ريال للرأس مع التحصين.',
          createdAt: hoursAgo(1),
        },
      ],
    },
  ];

  const priceOffers = [
    {
      id: 'off_1',
      listingId: 'lst_101',
      buyerId: 'usr_buyer_1',
      buyerName: 'خالد السبيعي',
      sellerId: 'usr_seller_1',
      offeredPrice: 1750,
      quantity: 4,
      note: 'شامل التوصيل داخل الرياض والدفع عند الاستلام.',
      status: 'pending',
      createdAt: hoursAgo(1.2),
      updatedAt: hoursAgo(1.2),
    },
    {
      id: 'off_2',
      listingId: 'lst_102',
      buyerId: 'usr_buyer_1',
      buyerName: 'خالد السبيعي',
      sellerId: 'usr_seller_2',
      offeredPrice: 3100,
      quantity: 1,
      note: 'صامل في الشراء بعد المعاينة في بريدة.',
      status: 'pending',
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    },
  ];

  const reports = [
    {
      id: 'rep_1',
      targetType: 'listing',
      reporterId: 'usr_buyer_1',
      listingId: 'lst_105',
      commentId: null,
      reason: 'استفسار عن السعر والتفاصيل',
      details: 'يرجى التأكد من توضيح عمر التغذية المحلية في الوصف بشكل أدق.',
      status: 'open',
      createdAt: hoursAgo(4),
      resolvedAt: null,
      resolutionNote: null,
    },
  ];

  const indicativePrices = [
    {
      id: 'prc_1',
      breedId: 'brd_naimi',
      breedName: 'نعيمي بلدي',
      categoryName: 'الأغنام',
      ageGroup: 'هرفي / جذع (6-9 أشهر)',
      minPrice: 1550,
      maxPrice: 2050,
      avgPrice: 1800,
      trend: 'up',
      regionNote: 'الرياض والقصيم والشرقية',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_2',
      breedId: 'brd_najdi',
      breedName: 'نجدي أصيل',
      categoryName: 'الأغنام',
      ageGroup: 'جذع (7-10 أشهر)',
      minPrice: 1700,
      maxPrice: 2350,
      avgPrice: 1980,
      trend: 'stable',
      regionNote: 'الرياض وحائل والقصيم',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_3',
      breedId: 'brd_harri',
      breedName: 'حري حجازي',
      categoryName: 'الأغنام',
      ageGroup: 'بهم وسط (5-8 أشهر)',
      minPrice: 1300,
      maxPrice: 1750,
      avgPrice: 1520,
      trend: 'stable',
      regionNote: 'مكة وجدة والطائف',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_4',
      breedId: 'brd_ardhi',
      breedName: 'ماعز عارضي',
      categoryName: 'الماعز',
      ageGroup: 'جذع / ثني',
      minPrice: 1150,
      maxPrice: 2400,
      avgPrice: 1650,
      trend: 'up',
      regionNote: 'الرياض والقصيم',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_5',
      breedId: 'brd_sawakni',
      breedName: 'سواكني مربى محلياً',
      categoryName: 'الأغنام',
      ageGroup: 'جذع كبير (9-12 شهراً)',
      minPrice: 1050,
      maxPrice: 1400,
      avgPrice: 1220,
      trend: 'down',
      regionNote: 'جميع مناطق المملكة',
      updatedAt: hoursAgo(6),
    },
  ];

  const articles = [
    {
      id: 'art_1',
      title: 'كيف تفحص الأضحية أو الذبيحة قبل الشراء؟ 7 علامات أساسية للصحة',
      category: 'إرشادات المشتري',
      readTimeMinutes: 4,
      publishedAt: hoursAgo(72),
      excerpt: 'دليل عملي لفحص العينين والصوف والأسنان والنشاط الحركي للتأكد من خلو الماشية من العيوب الشرعية والصحية.',
      content:
        'عند معاينة الماشية سواء في الحظيرة أو عند الاستلام، ابدأ بفحص النشاط العام للحيوان واستجابته للمحيط. تأكد من لمعان العينين وخلوهما من الإفرازات، وافحص الصوف أو الشعر للتأكد من تماسكه وعدم وجود مناطق صلع أو جرب. كما يُنصح بفحص الأسنان لمعرفة العمر التقريبي (جذع، ثني، رباع)، والتأكد من امتلاء الظهر والخواصر دلالةً على جودة التغذية.',
      imageUrl: IMG.naimi,
    },
    {
      id: 'art_2',
      title: 'برنامج التحصين البيطري السنوي للمربين في البيئة السعودية',
      category: 'رعاية المراح',
      readTimeMinutes: 5,
      publishedAt: hoursAgo(120),
      excerpt: 'جدول زمني متكامل للقاحات الدموي والمعوي والطاعون والجدري لتقليل النفوق ورفع كفاءة الإنتاج.',
      content:
        'تُعد الوقاية البيطرية حجر الأساس في نجاح أي مشروع تربية مواشٍ. يُنصح بالالتزام بجرعات التسمم الدموي والمعوي كل 6 أشهر، وتطعيم الجدري والحمى القلاعية حسب التوجيهات البيطرية الرسمية، مع عزل الحالات المشتراة حديثاً لمدة 14 يوماً قبل دمجها في القطيع الرئيسي.',
      imageUrl: IMG.hero,
    },
    {
      id: 'art_3',
      title: 'الفرق بين النعيمي والنجدي والحري: أيهما يناسب احتياجك؟',
      category: 'دليل السلالات',
      readTimeMinutes: 4,
      publishedAt: hoursAgo(180),
      excerpt: 'مقارنة شاملة في الوزن والمذاق وتحمّل المناخ والعائد الاقتصادي للمربين والمستهلكين.',
      content:
        'تتميز المملكة بتنوع سلالات الأغنام لتناسب أذواق المستهلكين وبيئات التربية المختلفة. يتصدر النعيمي مبيعات الولائم في الوسطى والشرقية لتوازن شحمه، بينما يحتفظ النجدي بمكانة تراثية واقتصادية رفيعة لدى المربين المحترفين، في حين يُعد الحري الخيار الأول في المنطقة الغربية بفضل طراوة لحمه وسرعة نموه.',
      imageUrl: IMG.najdi,
    },
  ];

  const faqs = [
    {
      id: 'faq_1',
      question: 'كيف تتم مراجعة الإعلانات في سوق الغنم 2.0؟',
      answer: 'يمر كل إعلان جديد بحالة «بانتظار المراجعة» حيث يتأكد فريق الإشراف من وضوح الصور واكتمال المواصفات (السلالة، العمر، الوزن، السعر بالريال) قبل اعتماده للنشر، وذلك لحماية المشترين والمربين.',
    },
    {
      id: 'faq_2',
      question: 'هل الأسعار الاسترشادية ملزمة للبائعين؟',
      answer: 'لا، الأسعار الاسترشادية هي متوسطات استرشادية تُحدّث أسبوعياً بناءً على حركة السوق والمناطق، وتساعد البائع والمشتري على التقييم العادل دون إلزام بسعر محدد.',
    },
    {
      id: 'faq_3',
      question: 'كيف أحصل على توثيق حساب المربي؟',
      answer: 'يمكن للمربين المنتظمين طلب التوثيق بعد نشر 3 إعلانات مكتملة وتوثيق رقم الجوال وتحديد موقع المراح، ليظهر شعار المربي الموثوق في ملفهم الشخصي وإعلاناتهم.',
    },
    {
      id: 'faq_4',
      question: 'ماذا أفعل إذا لاحظت إعلاناً غير مطابق أو مخالفاً؟',
      answer: 'يمكنك استخدام زر «إبلاغ عن مخالفة» داخل صفحة تفاصيل الإعلان، وسيصل البلاغ فوراً إلى لوحة المشرفين لاتخاذ الإجراء المناسب وحماية المستخدمين.',
    },
  ];

  const auditLogs = [
    {
      id: 'aud_1',
      actorId: 'usr_admin_1',
      actorName: 'إدارة المنصة',
      action: 'اعتماد إعلان',
      targetType: 'listing',
      targetId: 'lst_101',
      note: 'تم التحقق من الصور والمواصفات البيطرية.',
      createdAt: hoursAgo(2),
    },
  ];

  const notifications = [
    {
      id: 'ntf_1',
      userId: 'usr_buyer_1',
      type: 'new_message',
      title: 'رسالة جديدة من فهد القحطاني',
      body: 'وعليكم السلام ورحمة الله، حياك الله يا أبو عبدالله، نعم متوفرة وللأربعة رؤوس نحسبها لك بـ 1,800 ريال...',
      listingId: 'lst_101',
      conversationId: 'conv_1',
      read: false,
      createdAt: hoursAgo(1),
    },
  ];

  const sellerReviews = [
    {
      id: 'rev_1',
      sellerId: 'usr_seller_1',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 5,
      comment: 'تعامل راقٍ ومصداقية في الوزن والعمر والتحصين، الحلال وصل بحالة ممتازة.',
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'rev_2',
      sellerId: 'usr_seller_1',
      reviewerId: 'usr_seller_3',
      reviewerName: 'سالم الحربي',
      rating: 5,
      comment: 'مراح نظيف وأمانة في البيع والشراء وسرعة في التوصيل.',
      createdAt: hoursAgo(120),
      updatedAt: hoursAgo(120),
    },
    {
      id: 'rev_3',
      sellerId: 'usr_seller_2',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 4,
      comment: 'سلالات نجدية طيبة وأصل معروف، والتجاوب سريع.',
      createdAt: hoursAgo(96),
      updatedAt: hoursAgo(96),
    },
    {
      id: 'rev_4',
      sellerId: 'usr_seller_2',
      reviewerId: 'usr_seller_1',
      reviewerName: 'فهد القحطاني',
      rating: 5,
      comment: 'فحول صنف ومستوى عالٍ من العناية البيطرية.',
      createdAt: hoursAgo(168),
      updatedAt: hoursAgo(168),
    },
    {
      id: 'rev_5',
      sellerId: 'usr_seller_3',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 5,
      comment: 'الحري البلدي مطابق للمواصفات والوزن تماماً، أنصح بالتعامل معه.',
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(72),
    },
  ];

  const comments: CommentRecord[] = [
    {
      id: 'cmt_seed_1',
      listingId: 'lst_101',
      parentId: null,
      authorId: 'usr_buyer_1',
      authorName: 'خالد السبيعي',
      body: 'السلام عليكم، هل الجذعان محصّنة دموي ومعوي حديثاً؟ وهل يتوفر توصيل لشمال الرياض؟',
      isEdited: false,
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(4),
    },
    {
      id: 'cmt_seed_2',
      listingId: 'lst_101',
      parentId: 'cmt_seed_1',
      authorId: 'usr_seller_1',
      authorName: 'مراح القحطاني للنعيمي الفاخر',
      body: 'وعليكم السلام حياك الله، نعم جميعها محصّنة دموي ومعوي قبل شهر، والتوصيل متاح داخل الرياض وضواحيها بالاتفاق.',
      isEdited: false,
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    },
  ];

  return {
    users,
    sellers,
    categories,
    breeds,
    regions,
    listings,
    favorites,
    likes,
    likeNotificationHistory,
    conversations,
    priceOffers,
    notifications,
    sellerReviews,
    reports,
    indicativePrices,
    articles,
    faqs,
    auditLogs,
    comments,
    media: [],
    credentials: [],
    sessions: [],
  };
}

function inferSubCategoryId(
  listing: { title?: string; description?: string; sex?: string; ageMonths?: number; categoryId?: string },
  categories: any[]
): string | null {
  const subCategories = categories.filter((c) => c.parentId !== null);
  if (subCategories.length === 0) return null;

  const text = `${listing.title || ''} ${listing.description || ''}`.toLowerCase();
  let bestId: string | null = null;
  let bestScore = 0;

  for (const sub of subCategories) {
    const kws: string[] = Array.isArray(sub.keywords) ? sub.keywords : [];
    let score = 0;
    for (const kw of kws) {
      if (kw && text.includes(kw.toLowerCase())) {
        score += 2;
      }
    }
    if (sub.parentId && sub.parentId === listing.categoryId) {
      score += 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = sub.id;
    }
  }

  if (bestScore >= 2 && bestId) return bestId;

  if (listing.categoryId === 'cat_breeding') {
    const showCat = subCategories.find((c) => c.id === 'sub_show');
    if (showCat) return showCat.id;
  }
  if (listing.sex === 'أنثى' || listing.sex === 'قطيع مختلط') {
    const breedCat = subCategories.find((c) => c.id === 'sub_breeding');
    if (breedCat) return breedCat.id;
  }
  const slaughterCat = subCategories.find((c) => c.id === 'sub_slaughter');
  return slaughterCat?.id || subCategories[0]?.id || null;
}

function hydrateStore(parsed: StoreData): StoreData {
  const seed = createSeedData();
  const hasSubCategories = parsed.categories?.some((c) => c.parentId !== null);
  if (!hasSubCategories) {
    const existingIds = new Set((parsed.categories || []).map((c) => c.id));
    for (const cat of seed.categories) {
      if (!existingIds.has(cat.id)) {
        parsed.categories.push(cat);
      }
    }
  }
  if (!Array.isArray(parsed.priceOffers)) {
    parsed.priceOffers = seed.priceOffers;
  }
  if (!Array.isArray(parsed.notifications)) {
    parsed.notifications = seed.notifications;
  }
  if (!Array.isArray(parsed.sellerReviews)) {
    parsed.sellerReviews = seed.sellerReviews;
  }
  if (!Array.isArray(parsed.media)) {
    parsed.media = [];
  }
  if (!Array.isArray(parsed.comments)) {
    parsed.comments = [];
  }
  if (!Array.isArray(parsed.reports)) {
    parsed.reports = seed.reports;
  } else {
    parsed.reports = parsed.reports.map((r) => normalizeReportRecord(r));
  }
  parsed.likes = normalizeLikesStore(parsed.likes);
  parsed.likeNotificationHistory = normalizeLikeNotificationHistory(parsed.likeNotificationHistory);
  if (Array.isArray(parsed.users)) {
    parsed.users = parsed.users.map((u) => ({
      ...u,
      status: u.status === 'suspended' ? 'suspended' : 'active',
    }));
  }
  if (Array.isArray(parsed.sellers)) {
    parsed.sellers = parsed.sellers.map((s) => {
      const normalizedSeller = normalizeSellerVerificationFields(s);
      const reviews = (parsed.sellerReviews || []).filter((r) => r.sellerId === s.userId);
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
        return {
          ...normalizedSeller,
          rating: Math.round((sum / reviews.length) * 10) / 10,
          ratingCount: reviews.length,
        };
      }
      return { ...normalizedSeller, ratingCount: s.ratingCount ?? 0 };
    });
  }
  if (Array.isArray(parsed.listings)) {
    parsed.listings = parsed.listings.map((l) => ({
      ...l,
      subCategoryId: l.subCategoryId || inferSubCategoryId(l, parsed.categories),
      expectedPrice:
        l.expectedPrice !== undefined
          ? l.expectedPrice
          : l.isNegotiable
          ? Math.round(l.priceAmount * 0.92 / 10) * 10
          : null,
      allowPriceOffers:
        l.allowPriceOffers !== undefined ? Boolean(l.allowPriceOffers) : Boolean(l.isNegotiable),
    }));
  }
  migrateAuthFields(parsed);
  return parsed;
}

function loadStore(paths: StorePaths): StoreData {
  try {
    if (!fs.existsSync(paths.dataDir)) {
      fs.mkdirSync(paths.dataDir, { recursive: true });
    }
    if (!fs.existsSync(paths.storePath)) {
      const seed = createSeedData();
      writeStoreFile(paths, seed);
      return seed;
    }
    const raw = fs.readFileSync(paths.storePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // First run of the auth migration: keep an untouched copy of the existing data before rewriting it.
    if (!Array.isArray(parsed.credentials)) {
      const backupDir = path.join(paths.dataDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(backupDir, `store.pre-auth-${stamp}.json`), raw, { encoding: 'utf-8', mode: 0o600 });
    }
    const hydrated = hydrateStore(parsed);
    writeStoreFile(paths, hydrated);
    return hydrated;
  } catch (err) {
    // Never fall back to an in-memory seed over real data: refuse to start instead of risking data loss.
    console.error('Failed to load store:', err);
    throw err;
  }
}

/** Atomic write (temp file + rename), owner-only permissions: the file now holds password hashes. */
function writeStoreFile(paths: StorePaths, data: StoreData) {
  const tmp = `${paths.storePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, paths.storePath);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best effort cleanup of the temp file
    }
    throw err;
  }
}

export interface StartOptions {
  env?: Record<string, string | undefined>;
  config?: Partial<AppConfig>;
  /** Tests disable the Vite/static layer and only exercise the API. */
  serveFrontend?: boolean;
}

/**
 * Starts one isolated server instance. Each instance owns its data directory exclusively:
 * the directory is locked for the lifetime of the instance, so a second instance or the
 * `manage-users` CLI pointed at the same directory refuses to run instead of overwriting data.
 */
export async function startServer(opts: StartOptions = {}) {
  const config = loadConfig(opts.env || process.env, opts.config);
  const paths = makeStorePaths(resolveDataDir(config.dataDir));
  const lock = acquireStoreLock(paths.dataDir, 'server');
  try {
    const server = await runServer(opts, config, paths);
    const releaseOnExit = () => lock.release();
    process.once('exit', releaseOnExit);
    const closeServer = server.close;
    return {
      ...server,
      dataDir: paths.dataDir,
      close: async () => {
        process.off('exit', releaseOnExit);
        try {
          await closeServer();
        } finally {
          lock.release();
        }
      },
    };
  } catch (err) {
    lock.release();
    throw err;
  }
}

async function runServer(opts: StartOptions, config: AppConfig, paths: StorePaths) {
  const persister = new StorePersister<StoreData>(paths.dataDir, paths.storePath, 200);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  let store = loadStore(paths);

  const enforceRetention = () => {
    if (config.auditLogMaxActive > 0 && Array.isArray(store.auditLogs) && store.auditLogs.length > config.auditLogMaxActive) {
      const overflow = store.auditLogs.slice(config.auditLogMaxActive);
      try {
        // Archive oldest entries before removing them from the active store snapshot (newest-first).
        appendAuditArchive(paths.dataDir, overflow.slice().reverse());
        store.auditLogs = store.auditLogs.slice(0, config.auditLogMaxActive);
      } catch (err) {
        console.error('Failed to archive overflowing audit logs; keeping active entries intact:', err);
      }
    }
  };

  /** Instance-local immediate persistence for critical mutations. */
  const saveStore = (_data: StoreData) => {
    enforceRetention();
    persister.saveImmediate(store);
  };
  const persist = () => saveStore(store);
  /** Coalesced persistence for frequent non-critical metadata touches (session touches, read receipts). */
  const scheduleTouchSave = () => {
    persister.scheduleSave(() => store);
  };

  const httpServer = http.createServer(app);
  let realtime: ReturnType<typeof createRealtime> | null = null;

  const sessions = new SessionManager({
    getSessions: () => store.sessions,
    setSessions: (list) => {
      store.sessions = list;
    },
    persist,
    persistTouch: scheduleTouchSave,
    idleMs: config.sessionIdleMs,
    absoluteMs: config.sessionAbsoluteMs,
    maxPerUser: config.maxSessionsPerUser,
    // Ending a session (logout, expiry, revocation) also ends its live WebSocket connections.
    onRevoked: (ids) => realtime?.closeSessions(ids),
  });

  const authDeps = { config, sessions, getStore: () => store };
  const { attachAuth, mutationGuard, requireAuth, requireAdmin, securityHeaders, noStoreApi } =
    createAuthMiddleware(authDeps);

  app.use(securityHeaders);
  app.use('/api', noStoreApi);
  // Small body limit for the unauthenticated auth endpoints; the global limit applies elsewhere.
  app.use('/api/v1/auth', express.json({ limit: '10kb' }));
  app.use(express.json({ limit: INPUT_LIMITS.jsonBodyLimit }));

  const sourceImagesDir = path.resolve(__dirname, 'src/assets/images');
  const distImagesDir = path.resolve(__dirname, 'dist/src/assets/images');
  const resolvedImagesDir = fs.existsSync(sourceImagesDir) ? sourceImagesDir : distImagesDir;
  app.use(
    '/src/assets/images',
    express.static(resolvedImagesDir, {
      maxAge: config.isProd ? '7d' : 0,
      etag: true,
    })
  );

  // Every API request: resolve identity from the session cookie, then enforce Origin + CSRF on mutations.
  app.use('/api/v1', attachAuth, mutationGuard);
  app.use('/api/v1/auth', createAuthRouter({ ...authDeps, saveStore: persist }));
  // All admin APIs: one gate in front of every /admin route.
  app.use('/api/v1/admin', requireAdmin);

  const mediaUploadLimiter = new RateLimiter({ max: 40, windowMs: 15 * 60_000 });
  const mediaDeleteLimiter = new RateLimiter({ max: 60, windowMs: 15 * 60_000 });
  const commentLimiter = new RateLimiter({ max: 15, windowMs: 10 * 60_000 });
  const likeLimiter = new RateLimiter({ max: 30, windowMs: 5 * 60_000 });
  const contactRevealLimiter = new RateLimiter({ max: 15, windowMs: 15 * 60_000 });
  const listingCreateLimiter = new RateLimiter({ max: 15, windowMs: 15 * 60_000 });
  const listingUpdateLimiter = new RateLimiter({ max: 40, windowMs: 15 * 60_000 });
  const conversationStartLimiter = new RateLimiter({ max: 25, windowMs: 15 * 60_000 });
  const messageLimiter = new RateLimiter({ max: 60, windowMs: 5 * 60_000 });
  const offerLimiter = new RateLimiter({ max: 20, windowMs: 15 * 60_000 });
  const offerRespondLimiter = new RateLimiter({ max: 40, windowMs: 15 * 60_000 });
  const reviewLimiter = new RateLimiter({ max: 10, windowMs: 15 * 60_000 });
  const reportLimiter = new RateLimiter({ max: 10, windowMs: 15 * 60_000 });
  const favoriteLimiter = new RateLimiter({ max: 60, windowMs: 5 * 60_000 });
  const verificationRequestLimiter = new RateLimiter({ max: 5, windowMs: 60 * 60_000 });
  const readReceiptLimiter = new RateLimiter({ max: 120, windowMs: 5 * 60_000 });

  const enforceRateLimit = (
    limiter: RateLimiter,
    key: string,
    res: express.Response,
    message: string
  ): boolean => {
    const state = limiter.consume(key);
    if (!state.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(state.retryAfterMs / 1000))));
      res.status(429).json({ error: message, code: 'rate_limited' });
      return false;
    }
    return true;
  };

  const isUserSuspended = (userId: string): boolean => {
    const user = store.users.find((u) => u.id === userId);
    return Boolean(!user || user.status === 'suspended');
  };

  const isSellerContactAvailable = (seller: any): boolean => {
    const sellerUser = store.users.find((u) => u.id === seller?.userId);
    if (!sellerUser || sellerUser.status === 'suspended') return false;
    return Boolean(seller?.phone || seller?.whatsapp || sellerUser.phone);
  };

  const hasSellerInteraction = (viewerId: string, sellerId: string): boolean => {
    const hasConversationMessage = (store.conversations || []).some(
      (c) =>
        c.sellerId === sellerId &&
        c.buyerId === viewerId &&
        Array.isArray(c.messages) &&
        c.messages.length > 0
    );
    if (hasConversationMessage) return true;
    return (store.priceOffers || []).some(
      (o) => o.sellerId === sellerId && o.buyerId === viewerId
    );
  };

  realtime = createRealtime({
    httpServer,
    config,
    sessions,
    findUser: (id) => store.users.find((u) => u.id === id),
    getNotificationsFor: (id) => (store.notifications || []).filter((n) => n.userId === id),
  });
  const emitToUser = realtime.emitToUser;

  const pushNotification = (input: {
    userId: string;
    type:
      | 'offer_accepted'
      | 'offer_rejected'
      | 'new_message'
      | 'new_comment'
      | 'comment_reply'
      | 'listing_liked'
      | 'listing_approved'
      | 'listing_rejected'
      | 'seller_verified'
      | 'seller_verification_rejected';
    title: string;
    body: string;
    listingId?: string;
    conversationId?: string;
    commentId?: string;
  }) => {
    const item = {
      id: `ntf_${crypto.randomUUID().slice(0, 8)}`,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      listingId: input.listingId,
      conversationId: input.conversationId,
      commentId: input.commentId,
      read: false,
      createdAt: new Date().toISOString(),
    };
    store.notifications = store.notifications || [];
    store.notifications.unshift(item);

    if (config.maxReadNotificationsPerUser > 0) {
      let readSeen = 0;
      store.notifications = store.notifications.filter((n) => {
        if (n.userId !== input.userId || !n.read) return true;
        readSeen += 1;
        return readSeen <= config.maxReadNotificationsPerUser;
      });
    }

    emitToUser(input.userId, { type: 'notification:new', notification: item });
    return item;
  };

  const markConversationMessageNotificationsRead = (
    userId: string,
    conversationId: string
  ): boolean => {
    let changed = false;
    for (const ntf of store.notifications || []) {
      if (
        ntf.userId === userId &&
        ntf.type === 'new_message' &&
        ntf.conversationId === conversationId &&
        !ntf.read
      ) {
        ntf.read = true;
        changed = true;
      }
    }
    if (changed) {
      emitToUser(userId, {
        type: 'notifications:updated',
        notifications: (store.notifications || []).filter((n) => n.userId === userId),
      });
    }
    return changed;
  };

  const inFlightMediaIds = new Set<string>();
  const collectCandidateMediaIds = (imageInputs: unknown, videoInput: unknown): string[] => {
    const ids: string[] = [];
    if (Array.isArray(imageInputs)) {
      for (const entry of imageInputs) {
        const rawUrl =
          typeof entry === 'string'
            ? entry.trim()
            : typeof (entry as any)?.url === 'string'
            ? String((entry as any).url).trim()
            : '';
        const rawMediaId =
          typeof (entry as any)?.mediaId === 'string'
            ? String((entry as any).mediaId).trim()
            : extractMediaIdFromUrl(rawUrl);
        if (rawMediaId) ids.push(rawMediaId);
      }
    }
    if (videoInput !== undefined && videoInput !== null && videoInput !== '') {
      const rawVideoId =
        typeof videoInput === 'string'
          ? extractMediaIdFromUrl(videoInput) || videoInput.trim()
          : typeof (videoInput as any)?.mediaId === 'string'
          ? String((videoInput as any).mediaId).trim()
          : typeof (videoInput as any)?.url === 'string'
          ? extractMediaIdFromUrl(String((videoInput as any).url))
          : null;
      if (rawVideoId) ids.push(rawVideoId);
    }
    return ids;
  };

  const runOrphanedMediaCleanup = (nowMs = Date.now()): string[] => {
    const res = cleanupOrphanedDraftMedia({
      uploadsDir: paths.uploadsDir,
      mediaStore: store.media || [],
      listings: store.listings || [],
      ttlMs: config.unboundMediaTtlMs,
      nowMs,
      protectedMediaIds: inFlightMediaIds,
    });
    if (res.removedIds.length > 0) {
      store.media = res.mediaStore;
      persist();
    }
    return res.removedIds;
  };

  // Development only: demo accounts get random one-time passwords (printed once), never a shared default.
  if (config.demoAccounts) {
    for (const u of store.users) {
      if (!DEMO_USER_IDS.has(u.id) || store.credentials.some((c) => c.userId === u.id)) continue;
      const password = crypto.randomBytes(12).toString('base64url');
      store.credentials.push({ userId: u.id, passwordHash: await hashPassword(password), updatedAt: new Date().toISOString() });
      console.log(`[demo-account] ${u.phone} (${u.role}) one-time password: ${password}`);
    }
    persist();
  }
  if (config.isProd && !store.users.some((u) => u.role === 'admin' && !u.isDemo && store.credentials.some((c) => c.userId === u.id))) {
    console.warn('[security] No admin account with credentials exists. Create one with: npm run user:create-admin');
  }

  runOrphanedMediaCleanup();

  const sweeper = setInterval(() => sessions.sweep(), 10 * 60_000);
  sweeper.unref();
  const mediaSweeperIntervalMs = Math.max(
    60_000,
    Math.min(30 * 60_000, Math.floor(config.unboundMediaTtlMs / 2) || 60_000)
  );
  const mediaSweeper = setInterval(() => runOrphanedMediaCleanup(), mediaSweeperIntervalMs);
  mediaSweeper.unref();

  // Bootstrap endpoint: public data for everyone, private data only for the signed-in user.
  app.get('/api/v1/bootstrap', (req, res) => {
    const me = req.auth?.user ?? null;
    const favoriteIds = me ? store.favorites[me.id] || [] : [];
    const likedListingIds = me ? getUserLikedListingIds(store.likes, me.id, store.listings) : [];
    const visibleSellers = !me
      ? store.sellers.filter((s) => !isUserSuspended(s.userId))
      : store.sellers;

    res.json({
      sellers: visibleSellers.map((s) => toPublicSeller(s, isSellerContactAvailable(s))),
      categories: store.categories,
      breeds: store.breeds,
      regions: store.regions,
      indicativePrices: store.indicativePrices,
      articles: store.articles,
      faqs: store.faqs,
      currentUser: toSelfUser(me),
      csrfToken: req.auth?.csrfToken ?? null,
      favoriteIds,
      likedListingIds,
      conversations: me
        ? visibleConversations(me, store.conversations).map((c) =>
            toUserConversation(c, me.id, store)
          )
        : [],
      priceOffers: visibleOffers(me, store.priceOffers || []),
      notifications: me ? (store.notifications || []).filter((n) => n.userId === me.id) : [],
      reports: isAdmin(me) ? (store.reports || []).slice(0, 50) : [],
      auditLogs: isAdmin(me) ? (store.auditLogs || []).slice(0, 50) : [],
    });
  });

  // Targeted user activity snapshot so messaging/offers/notifications refreshes do not reset directory pagination.
  app.get('/api/v1/me/activity', requireAuth, (req, res) => {
    const me = req.auth!.user;
    res.json({
      favoriteIds: store.favorites[me.id] || [],
      likedListingIds: getUserLikedListingIds(store.likes, me.id, store.listings),
      conversations: visibleConversations(me, store.conversations).map((c) =>
        toUserConversation(c, me.id, store)
      ),
      priceOffers: visibleOffers(me, store.priceOffers || []),
      notifications: (store.notifications || []).filter((n) => n.userId === me.id),
      reports: isAdmin(me) ? (store.reports || []).slice(0, 50) : [],
      auditLogs: isAdmin(me) ? (store.auditLogs || []).slice(0, 50) : [],
    });
  });

  // Scoped, Paginated Seller Star Ratings & Reviews Endpoints
  app.get('/api/v1/sellers/:sellerId/reviews', (req, res) => {
    const viewer = req.auth?.user ?? null;
    const sellerId = String(req.params.sellerId || '').trim();
    const seller = store.sellers.find((s) => s.userId === sellerId);
    if (!seller || (!isAdmin(viewer) && isUserSuspended(sellerId))) {
      return res.status(404).json({ error: 'ملف المربي غير موجود' });
    }

    const limit =
      req.query.limit !== undefined
        ? parsePositiveInteger(req.query.limit, { label: 'عدد النتائج', min: 1, max: 50 })
        : 10;
    const offset =
      req.query.offset !== undefined
        ? parsePositiveInteger(req.query.offset, { label: 'مؤشر البداية', min: 0, max: 100_000 })
        : 0;

    const sellerReviewsList = (store.sellerReviews || [])
      .filter((r) => r.sellerId === sellerId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );

    const ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;
    for (const rev of sellerReviewsList) {
      const stars = Number(rev.rating) as 1 | 2 | 3 | 4 | 5;
      if (stars >= 1 && stars <= 5) {
        ratingBreakdown[stars] += 1;
        ratingSum += stars;
      }
    }

    const totalCount = sellerReviewsList.length;
    const averageRating =
      totalCount > 0 ? Math.round((ratingSum / totalCount) * 10) / 10 : seller.rating || 0;
    const paged = sellerReviewsList.slice(offset, offset + limit);
    const hasMore = offset + paged.length < totalCount;
    const nextOffset = hasMore ? offset + paged.length : null;

    const myReview = viewer
      ? sellerReviewsList.find((r) => r.reviewerId === viewer.id) || null
      : null;

    let canReview = false;
    let reviewEligibilityReason: 'unauthenticated' | 'self_review' | 'no_interaction' | null = null;
    if (!viewer) {
      reviewEligibilityReason = 'unauthenticated';
    } else if (viewer.id === sellerId) {
      reviewEligibilityReason = 'self_review';
    } else if (hasSellerInteraction(viewer.id, sellerId)) {
      canReview = true;
    } else {
      reviewEligibilityReason = 'no_interaction';
    }

    res.json({
      sellerId,
      reviews: paged,
      totalCount,
      limit,
      offset,
      hasMore,
      nextOffset,
      averageRating,
      ratingBreakdown,
      myReview,
      canReview,
      reviewEligibilityReason,
    });
  });

  app.post('/api/v1/sellers/:sellerId/reviews', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        reviewLimiter,
        `review:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لإرسال التقييمات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const sellerId = String(req.params.sellerId || '').trim();
    const seller = store.sellers.find((s) => s.userId === sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'ملف المربي غير موجود' });
    }
    if (isUserSuspended(sellerId)) {
      return res.status(403).json({
        error: 'لا يمكن إرسال تقييم لحساب موقوف حالياً',
        code: 'seller_suspended',
      });
    }
    if (currentUser.id === sellerId) {
      return res.status(400).json({ error: 'لا يمكنك تقييم مراحك أو حسابك الشخصي' });
    }
    if (!hasSellerInteraction(currentUser.id, sellerId)) {
      return res.status(403).json({
        error: 'يتاح التقييم بعد بدء محادثة أو تقديم عرض سعر مع المربي لضمان مصداقية التقييمات',
        code: 'review_requires_interaction',
      });
    }

    const parsedRating = parsePositiveInteger(req.body?.rating, {
      label: 'التقييم',
      min: 1,
      max: 5,
      code: 'invalid_rating',
    });
    const comment = validateOptionalText(req.body?.comment, {
      label: 'التعليق',
      maxLength: INPUT_LIMITS.reviewCommentMax,
      allowNewlines: true,
      defaultValue: '',
    });
    const nowIso = new Date().toISOString();

    store.sellerReviews = store.sellerReviews || [];
    const existingIdx = store.sellerReviews.findIndex(
      (r) => r.sellerId === sellerId && r.reviewerId === currentUser.id
    );

    let savedReview;
    if (existingIdx !== -1) {
      savedReview = {
        ...store.sellerReviews[existingIdx],
        reviewerName: currentUser.name,
        rating: parsedRating,
        comment,
        updatedAt: nowIso,
      };
      store.sellerReviews[existingIdx] = savedReview;
    } else {
      savedReview = {
        id: `rev_${crypto.randomUUID().slice(0, 6)}`,
        sellerId,
        reviewerId: currentUser.id,
        reviewerName: currentUser.name,
        rating: parsedRating,
        comment,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      store.sellerReviews.unshift(savedReview);
    }

    const sellerReviewsList = store.sellerReviews
      .filter((r) => r.sellerId === sellerId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
    const sum = sellerReviewsList.reduce((acc, r) => acc + Number(r.rating || 0), 0);
    seller.ratingCount = sellerReviewsList.length;
    seller.rating =
      sellerReviewsList.length > 0 ? Math.round((sum / sellerReviewsList.length) * 10) / 10 : 0;

    saveStore(store);
    res.status(existingIdx !== -1 ? 200 : 201).json({
      review: savedReview,
      seller: toPublicSeller(seller, isSellerContactAvailable(seller)),
      reviews: sellerReviewsList.slice(0, 10),
    });
  });

  // Notifications Read Endpoints
  app.post('/api/v1/notifications/:id/read', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        readReceiptLimiter,
        `read:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتحديث حالة الإشعارات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const target = (store.notifications || []).find(
      (n) => n.id === req.params.id && n.userId === currentUser.id
    );
    if (target) {
      target.read = true;
      scheduleTouchSave();
      emitToUser(currentUser.id, {
        type: 'notifications:updated',
        notifications: (store.notifications || []).filter((n) => n.userId === currentUser.id),
      });
    }
    res.json({ ok: true });
  });

  app.post('/api/v1/notifications/read-all', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        readReceiptLimiter,
        `read:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتحديث حالة الإشعارات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    let changed = false;
    store.notifications = (store.notifications || []).map((n) => {
      if (n.userId === currentUser.id && !n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });
    if (changed) {
      scheduleTouchSave();
    }
    emitToUser(currentUser.id, {
      type: 'notifications:updated',
      notifications: (store.notifications || []).filter((n) => n.userId === currentUser.id),
    });
    res.json({ ok: true });
  });

  // GET /api/v1/listings with validated Arabic search, combined filters, strict authorization, deterministic sorting & pagination
  app.get('/api/v1/listings', (req, res) => {
    const currentUser = req.auth?.user ?? null;
    const parsedQuery = validateAndParseListingQuery(req.query as Record<string, unknown>);
    if (!parsedQuery.ok) {
      return res.status(400).json({ error: parsedQuery.error, code: parsedQuery.code });
    }

    const params = parsedQuery.value;
    let items = [...store.listings];

    // Strict permission & status checks: unpublished/sold items are never leaked to unauthorized viewers
    if (params.status) {
      if (params.status === 'Published') {
        items = items.filter((l) => l.status === 'Published');
        if (params.sellerId) {
          items = items.filter((l) => l.sellerId === params.sellerId);
        }
      } else if (isAdmin(currentUser)) {
        items = items.filter(
          (l) =>
            l.status === params.status &&
            (!params.sellerId || l.sellerId === params.sellerId)
        );
      } else if (currentUser && params.sellerId && params.sellerId === currentUser.id) {
        items = items.filter(
          (l) => l.sellerId === currentUser.id && l.status === params.status
        );
      } else if (currentUser && !params.sellerId && params.status === 'Sold') {
        items = items.filter((l) => l.sellerId === currentUser.id && l.status === 'Sold');
      } else {
        items = items.filter(
          (l) =>
            l.status === 'Published' &&
            (!params.sellerId || l.sellerId === params.sellerId)
        );
      }
    } else if (params.sellerId) {
      if ((currentUser && params.sellerId === currentUser.id) || isAdmin(currentUser)) {
        items = items.filter((l) => l.sellerId === params.sellerId);
      } else {
        items = items.filter(
          (l) => l.sellerId === params.sellerId && l.status === 'Published'
        );
      }
    } else if (params.availability === 'sold') {
      items = items.filter((l) => l.status === 'Sold' && canViewListing(currentUser, l));
    } else if (params.includeAllStatuses && isAdmin(currentUser)) {
      // Admin dashboard inventory across all listing statuses (Draft, Pending, Published, Rejected, Sold, Expired)
    } else {
      items = items.filter((l) => l.status === 'Published');
    }

    // Hide suspended sellers' listings from public browsing, search, and non-admin callers
    if (!isAdmin(currentUser)) {
      items = items.filter((l) => !isUserSuspended(l.sellerId));
    }

    if (params.availability === 'available') {
      items = items.filter((l) => l.quantity > 0);
    } else if (params.availability === 'accepts_offers') {
      items = items.filter((l) => Boolean(l.allowPriceOffers));
    } else if (params.availability === 'negotiable') {
      items = items.filter((l) => Boolean(l.isNegotiable));
    }

    if (params.q) {
      const searchContext = {
        breeds: store.breeds,
        categories: store.categories,
        regions: store.regions,
        sellers: store.sellers,
      };
      items = items.filter((l) => listingMatchesSearchQuery(l, params.q, searchContext));
    }

    if (params.categoryId) {
      items = items.filter((l) => l.categoryId === params.categoryId);
    }
    if (params.subCategoryId) {
      items = items.filter((l) => l.subCategoryId === params.subCategoryId);
    }
    if (params.breedId) {
      items = items.filter((l) => l.breedId === params.breedId);
    }
    if (params.regionId) {
      items = items.filter((l) => l.regionId === params.regionId);
    }
    if (params.city) {
      items = items.filter((l) => listingMatchesCity(l.city, params.city));
    }
    if (params.minPrice !== undefined) {
      items = items.filter((l) => l.priceAmount >= params.minPrice!);
    }
    if (params.maxPrice !== undefined) {
      items = items.filter((l) => l.priceAmount <= params.maxPrice!);
    }
    if (params.minQty !== undefined) {
      items = items.filter((l) => l.quantity >= params.minQty!);
    }
    if (params.maxQty !== undefined) {
      items = items.filter((l) => l.quantity <= params.maxQty!);
    }
    if (params.sex) {
      items = items.filter((l) => l.sex === params.sex);
    }
    if (params.minAge !== undefined) {
      items = items.filter((l) => l.ageMonths >= params.minAge!);
    }
    if (params.maxAge !== undefined) {
      items = items.filter((l) => l.ageMonths <= params.maxAge!);
    }
    if (params.verifiedOnly) {
      const verifiedSellerIds = new Set(
        store.sellers
          .filter((s) => s.verificationStatus === 'Verified')
          .map((s) => s.userId)
      );
      items = items.filter((l) => verifiedSellerIds.has(l.sellerId));
    }
    if (params.vaccinatedOnly) {
      items = items.filter((l) => Boolean(l.vaccinated));
    }
    if (params.hasVideoOnly) {
      items = items.filter((l) => Boolean(l.video?.url));
    }
    if (params.negotiableOnly) {
      items = items.filter((l) => Boolean(l.isNegotiable));
    }
    if (params.acceptsOffersOnly) {
      items = items.filter((l) => Boolean(l.allowPriceOffers));
    }

    const withLikes = sortListingsDeterministic(
      items.map((l) => attachLikesCountToListing(l, store.likes)),
      params.sort
    );

    const totalCount = withLikes.length;
    const paged = withLikes.slice(params.offset, params.offset + params.limit);
    const hasMore = params.offset + paged.length < totalCount;
    const nextOffset = hasMore ? params.offset + paged.length : null;
    const page = Math.floor(params.offset / params.limit) + 1;
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / params.limit);

    res.json({
      listings: paged,
      total: totalCount,
      totalCount,
      limit: params.limit,
      offset: params.offset,
      page,
      totalPages,
      hasMore,
      nextOffset,
    });
  });

  // GET /api/v1/listings/:id
  app.get('/api/v1/listings/:id', (req, res) => {
    const viewer = req.auth?.user ?? null;
    const item = store.listings.find((l) => l.id === req.params.id);
    // Unpublished or suspended-seller listings are invisible (404, not 403) to non-admin viewers.
    if (!item || !canViewListing(viewer, item) || (!isAdmin(viewer) && isUserSuspended(item.sellerId))) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    res.json({ listing: attachLikesCountToListing(item, store.likes) });
  });

  // POST /api/v1/listings/:id/contact (Rate-limited, authenticated on-demand seller contact reveal)
  app.post('/api/v1/listings/:id/contact', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        contactRevealLimiter,
        `contact:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لطلبات إظهار بيانات التواصل مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    if (listing.status !== 'Published') {
      return res.status(403).json({
        error: 'بيانات الاتصال المباشر متاحة فقط للإعلانات المنشورة',
        code: 'listing_not_published',
      });
    }

    const sellerUser = store.users.find((u) => u.id === listing.sellerId);
    if (!sellerUser || sellerUser.status === 'suspended') {
      return res.status(403).json({
        error: 'لا تتوفر بيانات التواصل لهذا الحساب حالياً',
        code: 'seller_suspended',
      });
    }

    const seller = store.sellers.find((s) => s.userId === listing.sellerId);
    res.json({
      listingId: listing.id,
      sellerId: listing.sellerId,
      phone: seller?.phone || sellerUser.phone || null,
      whatsapp: seller?.whatsapp || null,
    });
  });

  // Public Listing Likes Endpoints (separate from private Favorites)
  app.get('/api/v1/listings/:id/likes', (req, res) => {
    const viewer = req.auth?.user ?? null;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing || !canViewListing(viewer, listing) || (!isAdmin(viewer) && isUserSuspended(listing.sellerId))) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    const likesEnabled = listing.status === 'Published';
    res.json({
      listingId: listing.id,
      likesCount: likesEnabled ? getListingLikesCount(store.likes, listing.id) : 0,
      isLiked:
        likesEnabled && viewer
          ? hasUserLikedListing(store.likes, listing.id, viewer.id)
          : false,
      likesEnabled,
    });
  });

  const handleLikeMutation = (
    req: express.Request,
    res: express.Response,
    forcedAction?: LikeAction
  ) => {
    const currentUser = req.auth!.user;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    if (!canLikeListing(currentUser, listing)) {
      return res.status(403).json({ error: 'الإعجاب متاح فقط للإعلانات المنشورة' });
    }
    if (isUserSuspended(listing.sellerId)) {
      return res.status(403).json({
        error: 'هذا الحساب موقوف حالياً ولا يمكن التفاعل مع إعلاناته',
        code: 'seller_suspended',
      });
    }

    let action: LikeAction;
    try {
      action = forcedAction ?? parseLikeAction(req.body?.action);
    } catch (err) {
      if (err instanceof LikeValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    const rateCheck = likeLimiter.consume(`like:${currentUser.id}`);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000))));
      return res.status(429).json({
        error: 'تجاوزت الحد المسموح لتحديث الإعجاب مؤقتاً، حاول بعد قليل',
        code: 'rate_limited',
      });
    }

    store.likes = store.likes || {};
    store.likeNotificationHistory = store.likeNotificationHistory || {};

    const result = applyListingLikeMutation({
      likes: store.likes,
      listingId: listing.id,
      userId: currentUser.id,
      action,
    });

    if (result.changed) {
      if (
        result.isLiked &&
        shouldSendLikeNotification({
          history: store.likeNotificationHistory,
          listingId: listing.id,
          actorId: currentUser.id,
          sellerId: listing.sellerId,
        })
      ) {
        recordLikeNotification({
          history: store.likeNotificationHistory,
          listingId: listing.id,
          actorId: currentUser.id,
        });
        pushNotification({
          userId: listing.sellerId,
          type: 'listing_liked',
          title: `إعجاب جديد من ${currentUser.name}`,
          body: `أعجب ${currentUser.name} بإعلانك «${listing.title}» (إجمالي الإعجابات: ${result.likesCount})`,
          listingId: listing.id,
        });
      }

      realtime?.broadcast({
        type: 'listing:likes-updated',
        listingId: listing.id,
        likesCount: result.likesCount,
      });

      saveStore(store);
    }

    res.json({
      listingId: listing.id,
      likesCount: result.likesCount,
      isLiked: result.isLiked,
      likedListingIds: getUserLikedListingIds(store.likes, currentUser.id, store.listings),
    });
  };

  app.post('/api/v1/listings/:id/like', requireAuth, (req, res) =>
    handleLikeMutation(req, res)
  );
  app.put('/api/v1/listings/:id/like', requireAuth, (req, res) =>
    handleLikeMutation(req, res, 'like')
  );
  app.delete('/api/v1/listings/:id/like', requireAuth, (req, res) =>
    handleLikeMutation(req, res, 'unlike')
  );

  // Public Listing Questions & Comments Endpoints
  app.get('/api/v1/listings/:id/comments', (req, res) => {
    const viewer = req.auth?.user ?? null;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing || !canViewListing(viewer, listing) || (!isAdmin(viewer) && isUserSuspended(listing.sellerId))) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }

    if (!canViewListingComments(listing)) {
      return res.json({
        threads: [],
        totalThreads: 0,
        totalCount: 0,
        limit: 5,
        offset: 0,
        hasMore: false,
        nextOffset: null,
        commentsEnabled: false,
      });
    }

    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
    const result = paginateListingThreads({
      comments: store.comments || [],
      listing,
      users: store.users,
      sellers: store.sellers,
      limit,
      offset,
    });

    res.json({
      ...result,
      commentsEnabled: true,
    });
  });

  app.post('/api/v1/listings/:id/comments', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    if (!canViewListingComments(listing)) {
      return res.status(403).json({ error: 'الأسئلة والتعليقات متاحة فقط على الإعلانات المنشورة' });
    }
    if (isUserSuspended(listing.sellerId)) {
      return res.status(403).json({
        error: 'هذا الحساب موقوف حالياً ولا يمكن التعليق على إعلاناته',
        code: 'seller_suspended',
      });
    }

    const rateCheck = commentLimiter.consume(`comment:${currentUser.id}`);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000))));
      return res.status(429).json({
        error: 'تجاوزت الحد المسموح لإرسال التعليقات مؤقتاً، حاول بعد قليل',
        code: 'rate_limited',
      });
    }

    let cleanBody: string;
    try {
      cleanBody = normalizeAndValidateCommentBody(req.body?.body);
    } catch (err) {
      if (err instanceof CommentValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    const rawParentId = req.body?.parentId;
    const parentId =
      typeof rawParentId === 'string' && rawParentId.trim() ? rawParentId.trim() : null;

    let parentComment: CommentRecord | undefined;
    if (parentId !== null) {
      if (!canReplyToListingComment(currentUser, listing)) {
        return res.status(403).json({
          error: 'فقط صاحب الإعلان يمكنه الرد مباشرة على الأسئلة',
          code: 'forbidden',
        });
      }
      parentComment = (store.comments || []).find(
        (c) => c.id === parentId && c.listingId === listing.id
      );
      if (!parentComment) {
        return res.status(404).json({ error: 'التعليق الأساسي غير موجود' });
      }
      if (parentComment.parentId !== null) {
        return res.status(400).json({ error: 'لا يمكن الرد على رد؛ يرجى الرد على السؤال الأساسي' });
      }
    }

    store.comments = store.comments || [];
    if (
      isDuplicateRecentComment({
        comments: store.comments,
        listingId: listing.id,
        parentId,
        authorId: currentUser.id,
        body: cleanBody,
      })
    ) {
      return res.status(400).json({ error: 'تم إرسال هذا التعليق بالفعل قبل قليل' });
    }

    const nowIso = new Date().toISOString();
    const record: CommentRecord = {
      id: `cmt_${crypto.randomUUID().slice(0, 8)}`,
      listingId: listing.id,
      parentId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      body: cleanBody,
      isEdited: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.comments.push(record);

    if (parentId === null && currentUser.id !== listing.sellerId) {
      pushNotification({
        userId: listing.sellerId,
        type: 'new_comment',
        title: `سؤال جديد من ${currentUser.name}`,
        body: `على إعلان «${listing.title}»: ${cleanBody.slice(0, 90)}`,
        listingId: listing.id,
        commentId: record.id,
      });
      emitToUser(listing.sellerId, {
        type: 'listing:comments-updated',
        listingId: listing.id,
      });
    } else if (parentComment && parentComment.authorId !== currentUser.id) {
      const sellerProfile = store.sellers.find((s) => s.userId === listing.sellerId);
      const sellerLabel = sellerProfile?.displayName || currentUser.name;
      pushNotification({
        userId: parentComment.authorId,
        type: 'comment_reply',
        title: `رد ${sellerLabel} على سؤالك`,
        body: `على إعلان «${listing.title}»: ${cleanBody.slice(0, 90)}`,
        listingId: listing.id,
        commentId: record.id,
      });
      emitToUser(parentComment.authorId, {
        type: 'listing:comments-updated',
        listingId: listing.id,
      });
    }

    saveStore(store);
    res.status(201).json({
      comment: toPublicComment(record, listing, store.users, store.sellers),
    });
  });

  app.patch('/api/v1/comments/:id', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        commentLimiter,
        `comment:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتعديل التعليقات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const commentId = String(req.params.id || '').trim();
    const comment = (store.comments || []).find((c) => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: 'التعليق غير موجود' });
    }

    const listing = store.listings.find((l) => l.id === comment.listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'التعليق غير موجود' });
    }
    if (!canViewListingComments(listing)) {
      return res.status(403).json({ error: 'لا يمكن تعديل تعليقات إعلان غير منشور' });
    }
    if (!canEditComment(currentUser, comment, listing)) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا التعليق' });
    }

    let cleanBody: string;
    try {
      cleanBody = normalizeAndValidateCommentBody(req.body?.body);
    } catch (err) {
      if (err instanceof CommentValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    comment.body = cleanBody;
    comment.isEdited = true;
    comment.updatedAt = new Date().toISOString();
    saveStore(store);

    res.json({
      comment: toPublicComment(comment, listing, store.users, store.sellers),
    });
  });

  app.delete('/api/v1/comments/:id', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        commentLimiter,
        `comment:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لإدارة التعليقات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const commentId = String(req.params.id || '').trim();
    const comment = (store.comments || []).find((c) => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: 'التعليق غير موجود' });
    }

    const listing = store.listings.find((l) => l.id === comment.listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'التعليق غير موجود' });
    }
    if (!canDeleteComment(currentUser, comment)) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا التعليق' });
    }

    const deletedIds = new Set<string>([comment.id]);
    for (const c of store.comments || []) {
      if (c.parentId === comment.id) {
        deletedIds.add(c.id);
      }
    }

    const reason = validateOptionalText(req.body?.reason, {
      label: 'سبب الحذف',
      maxLength: 300,
      defaultValue: '',
    });

    store.comments = (store.comments || []).filter((c) => !deletedIds.has(c.id));

    if (isAdmin(currentUser) && comment.authorId !== currentUser.id) {
      const nowIso = new Date().toISOString();
      for (const rep of store.reports || []) {
        if (
          rep.status === 'open' &&
          rep.commentId &&
          deletedIds.has(rep.commentId)
        ) {
          rep.status = 'resolved';
          rep.resolvedAt = nowIso;
          rep.resolvedBy = currentUser.id;
          rep.resolutionNote = reason || 'تمت إزالة التعليق المخالف';
        }
      }
      store.auditLogs.unshift(
        createAuditLogEntry({
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: 'إزالة تعليق مخالف',
          targetType: 'comment',
          targetId: comment.id,
          note: reason || comment.body.slice(0, 90),
          createdAt: nowIso,
        })
      );
    }

    saveStore(store);
    res.json({ ok: true, deletedIds: [...deletedIds] });
  });

  // Media Upload / Retrieval / Deletion Endpoints
  app.post('/api/v1/media/upload', requireAuth, async (req, res) => {
    const currentUser = req.auth!.user;
    const rateCheck = mediaUploadLimiter.consume(`upload:${currentUser.id}`);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'تجاوزت الحد المسموح لرفع الملفات مؤقتاً، حاول بعد قليل',
      });
    }

    const unboundCount = (store.media || []).filter(
      (m) => m.uploaderId === currentUser.id && m.listingId === null
    ).length;
    if (unboundCount >= MAX_UNBOUND_MEDIA_PER_USER) {
      return res.status(429).json({
        error: 'لديك عدد كبير من الملفات المرفوعة غير المرتبطة بإعلانات؛ يرجى إكمال النشر أو حذف بعض الملفات أولاً',
      });
    }

    try {
      const parsed = await parseUploadRequest(req);
      const asset = storeUploadedMedia({
        uploadsDir: paths.uploadsDir,
        parsed,
        uploaderId: currentUser.id,
      });
      store.media = store.media || [];
      store.media.unshift(asset);
      saveStore(store);
      res.status(201).json({
        media: toPublicMedia(asset),
        limits: {
          maxImageBytes: MAX_IMAGE_BYTES,
          maxVideoBytes: MAX_VIDEO_BYTES,
        },
      });
    } catch (err) {
      if (err instanceof MediaUploadError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      console.error('Media upload failed:', err);
      return res.status(500).json({ error: 'تعذر رفع الملف، حاول مرة أخرى' });
    }
  });

  app.get('/api/v1/media/:id', (req, res) => {
    const mediaId = String(req.params.id || '').trim();
    const asset = (store.media || []).find((m) => m.id === mediaId);
    if (!asset) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    const viewer = req.auth?.user ?? null;
    let isPublished = false;
    if (asset.listingId) {
      const listing = store.listings.find((l) => l.id === asset.listingId);
      if (
        !listing ||
        !canViewListing(viewer, listing) ||
        (!isAdmin(viewer) && isUserSuspended(listing.sellerId))
      ) {
        return res.status(404).json({ error: 'الملف غير موجود' });
      }
      isPublished = listing.status === 'Published';
    } else if (!viewer || (asset.uploaderId !== viewer.id && !isAdmin(viewer))) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    let safePath: string;
    try {
      safePath = resolveSafeMediaPath(paths.uploadsDir, asset.filename);
    } catch {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader(
      'Cache-Control',
      isPublished ? 'private, max-age=300' : 'private, no-store'
    );
    res.sendFile(safePath);
  });

  app.delete('/api/v1/media/:id', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        mediaDeleteLimiter,
        `media-del:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لحذف الوسائط مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const mediaId = String(req.params.id || '').trim();
    const idx = (store.media || []).findIndex((m) => m.id === mediaId);
    if (idx === -1) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    const asset = store.media[idx];
    if (asset.uploaderId !== currentUser.id && !isAdmin(currentUser)) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا الملف' });
    }

    if (asset.listingId) {
      const listing = store.listings.find((l) => l.id === asset.listingId);
      if (listing) {
        if (!canEditListing(currentUser, listing)) {
          return res.status(403).json({ error: 'غير مصرح لك بتعديل وسائط هذا الإعلان' });
        }
        if (Array.isArray(listing.images)) {
          listing.images = listing.images
            .filter((img: any) => img.mediaId !== asset.id && img.url !== asset.url)
            .map((img: any, i: number) => ({ ...img, position: i + 1 }));
          if (listing.images.length === 0) {
            const breed = store.breeds.find((b) => b.id === listing.breedId);
            listing.images = [
              {
                id: `img_${crypto.randomUUID().slice(0, 6)}`,
                url: breed?.imageUrl || IMG.naimi,
                position: 1,
              },
            ];
          }
        }
        if (listing.video && (listing.video.mediaId === asset.id || listing.video.url === asset.url)) {
          listing.video = null;
        }
        if (!isAdmin(currentUser) && (listing.status === 'Published' || listing.status === 'Rejected' || listing.status === 'Expired')) {
          listing.status = 'Pending';
          listing.rejectionReason = undefined;
        }
        listing.updatedAt = new Date().toISOString();
      }
    }

    store.media.splice(idx, 1);
    removeMediaFile(paths.uploadsDir, asset.filename);
    saveStore(store);
    res.json({ ok: true });
  });

  // POST /api/v1/listings (Create listing -> Pending moderation)
  app.post('/api/v1/listings', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        listingCreateLimiter,
        `listing-create:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لنشر الإعلانات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const {
      categoryId,
      subCategoryId,
      breedId,
      regionId,
      city,
      title,
      description,
      priceAmount,
      expectedPrice,
      sex,
      ageMonths,
      weightKg,
      quantity,
      isNegotiable,
      allowPriceOffers,
      vaccinated,
      status: requestedStatus,
      imageUrls,
      images,
      video,
      videoMediaId,
    } = req.body || {};

    const cleanTitle = validateRequiredText(title, {
      label: 'عنوان الإعلان',
      minLength: INPUT_LIMITS.listingTitleMin,
      maxLength: INPUT_LIMITS.listingTitleMax,
      code: 'invalid_title',
    });
    const cleanDescription = validateOptionalText(description, {
      label: 'وصف الإعلان',
      maxLength: INPUT_LIMITS.listingDescriptionMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_description',
    });
    const cleanCity =
      city !== undefined && city !== null
        ? validateRequiredText(city, {
            label: 'المدينة',
            minLength: INPUT_LIMITS.listingCityMin,
            maxLength: INPUT_LIMITS.listingCityMax,
            code: 'invalid_city',
          })
        : 'الرياض';

    const cleanBreedId = typeof breedId === 'string' ? breedId.trim() : '';
    const breed = store.breeds.find((b) => b.id === cleanBreedId);
    if (!breed) {
      return res.status(400).json({ error: 'السلالة المحددة غير صالحة', code: 'invalid_breed' });
    }

    const cleanRegionId = typeof regionId === 'string' ? regionId.trim() : '';
    if (!store.regions.some((r) => r.id === cleanRegionId)) {
      return res.status(400).json({ error: 'المنطقة المحددة غير صالحة', code: 'invalid_region' });
    }

    const resolvedCategoryId =
      typeof categoryId === 'string' && categoryId.trim() ? categoryId.trim() : breed.categoryId;
    if (!store.categories.some((c) => c.id === resolvedCategoryId && c.parentId === null)) {
      return res.status(400).json({ error: 'التصنيف الرئيسي المحدد غير صالح', code: 'invalid_category' });
    }

    let explicitSubCategoryId: string | null = null;
    if (subCategoryId !== undefined && subCategoryId !== null && subCategoryId !== '' && subCategoryId !== 'auto') {
      if (
        typeof subCategoryId !== 'string' ||
        !store.categories.some((c) => c.id === subCategoryId.trim() && c.parentId !== null)
      ) {
        return res.status(400).json({ error: 'الفئة الفرعية المحددة غير صالحة', code: 'invalid_subcategory' });
      }
      explicitSubCategoryId = subCategoryId.trim();
    }

    const allowedSexes = new Set(['ذكر', 'أنثى', 'قطيع مختلط']);
    const resolvedSex = sex === undefined || sex === null || sex === '' ? 'ذكر' : sex;
    if (typeof resolvedSex !== 'string' || !allowedSexes.has(resolvedSex)) {
      return res.status(400).json({ error: 'قيمة الجنس غير صالحة', code: 'invalid_sex' });
    }

    const parsedPrice = parseFinitePositiveNumber(priceAmount, {
      label: 'السعر المطلوب للرأس',
      max: INPUT_LIMITS.listingPriceMax,
      code: 'invalid_price',
    });

    const expectedCheck = validateExpectedPriceRule({
      priceAmount: parsedPrice,
      expectedPrice,
    });
    if (!expectedCheck.ok) {
      return res.status(400).json({ error: expectedCheck.error, code: 'invalid_expected_price' });
    }
    const parsedExpected = expectedCheck.value;

    const parsedQuantity =
      quantity !== undefined && quantity !== null && quantity !== ''
        ? parsePositiveInteger(quantity, {
            label: 'الكمية',
            min: 1,
            max: INPUT_LIMITS.listingQuantityMax,
            code: 'invalid_quantity',
          })
        : 1;
    const parsedAgeMonths =
      ageMonths !== undefined && ageMonths !== null && ageMonths !== ''
        ? parsePositiveInteger(ageMonths, {
            label: 'العمر بالأشهر',
            min: INPUT_LIMITS.listingAgeMin,
            max: INPUT_LIMITS.listingAgeMax,
            code: 'invalid_age',
          })
        : 8;
    const parsedWeightKg =
      weightKg !== undefined && weightKg !== null && weightKg !== ''
        ? parseFinitePositiveNumber(weightKg, {
            label: 'الوزن التقريبي',
            minInclusive: INPUT_LIMITS.listingWeightMin,
            max: INPUT_LIMITS.listingWeightMax,
            code: 'invalid_weight',
          })
        : 42;

    const fallbackUrl = breed.imageUrl || IMG.naimi;
    const listingId = `lst_${crypto.randomUUID().slice(0, 6)}`;
    const candidateImageInputs = images !== undefined ? images : imageUrls;
    const candidateVideoInput = video !== undefined ? video : videoMediaId;
    const candidateMediaIds = collectCandidateMediaIds(candidateImageInputs, candidateVideoInput);
    for (const id of candidateMediaIds) inFlightMediaIds.add(id);

    try {
      let resolvedMedia: ReturnType<typeof resolveListingMedia>;
      try {
        resolvedMedia = resolveListingMedia({
          actorId: currentUser.id,
          actorIsAdmin: isAdmin(currentUser),
          targetListingId: listingId,
          mediaStore: store.media || [],
          imageInputs: candidateImageInputs,
          videoInput: candidateVideoInput,
          fallbackImageUrl: fallbackUrl,
        });
      } catch (err) {
        if (err instanceof MediaUploadError) {
          return res.status(err.status).json({ error: err.message, code: err.code });
        }
        throw err;
      }

      // Ensure seller profile exists if user posts a listing
      if (!store.sellers.some((s) => s.userId === currentUser.id)) {
        const requestedAt = new Date().toISOString();
        store.sellers.push({
          userId: currentUser.id,
          displayName: `مراح ${currentUser.name}`,
          bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
          regionId: cleanRegionId,
          city: cleanCity,
          phone: currentUser.phone,
          whatsapp: `966${currentUser.phone.replace(/^0/, '')}`,
          verificationStatus: 'Pending',
          verifiedAt: null,
          verificationNote: null,
          verificationRequestedAt: requestedAt,
          verificationReviewedAt: null,
          yearsExperience: 2,
          specialty: 'أغنام وماعز',
          rating: 0,
          ratingCount: 0,
          totalSales: 0,
        });
      }

      for (const asset of store.media || []) {
        if (resolvedMedia.boundMediaIds.has(asset.id)) {
          asset.listingId = listingId;
        }
      }

      const resolvedSubCategoryId =
        explicitSubCategoryId ??
        inferSubCategoryId(
          {
            title: cleanTitle,
            description: cleanDescription,
            sex: resolvedSex,
            ageMonths: parsedAgeMonths,
            categoryId: resolvedCategoryId,
          },
          store.categories
        );

      const allowOffers =
        allowPriceOffers !== undefined ? Boolean(allowPriceOffers) : Boolean(isNegotiable);

      const initialStatus =
        requestedStatus === 'Draft'
          ? 'Draft'
          : isAdmin(currentUser)
          ? 'Published'
          : 'Pending';

      const nowIso = new Date().toISOString();
      const newListing = {
        id: listingId,
        sellerId: currentUser.id,
        categoryId: resolvedCategoryId,
        subCategoryId: resolvedSubCategoryId,
        breedId: cleanBreedId,
        regionId: cleanRegionId,
        city: cleanCity,
        title: cleanTitle,
        slug: `listing-${Date.now()}`,
        description: cleanDescription,
        priceAmount: parsedPrice,
        expectedPrice: parsedExpected,
        currency: 'SAR',
        sex: resolvedSex,
        ageMonths: parsedAgeMonths,
        weightKg: parsedWeightKg,
        quantity: parsedQuantity,
        isNegotiable: Boolean(isNegotiable) || allowOffers,
        allowPriceOffers: allowOffers,
        vaccinated: Boolean(vaccinated),
        // Admins publish directly; standard users go to Pending review (or Draft if explicitly requested)
        status: initialStatus,
        publishedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        isFeatured: false,
        images: resolvedMedia.images,
        ...(resolvedMedia.video ? { video: resolvedMedia.video } : {}),
      };

      store.listings.unshift(newListing);
      saveStore(store);
      res.status(201).json({ listing: attachLikesCountToListing(newListing, store.likes) });
    } finally {
      for (const id of candidateMediaIds) inFlightMediaIds.delete(id);
    }
  });

  // PATCH /api/v1/listings/:id (Ownership enforced, cannot bypass Rejected status)
  app.patch('/api/v1/listings/:id', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        listingUpdateLimiter,
        `listing-update:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتعديل الإعلانات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const idx = store.listings.findIndex((l) => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الإعلان غير موجود' });

    const existing = store.listings[idx];
    if (!canEditListing(currentUser, existing)) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الإعلان' });
    }

    const {
      categoryId,
      breedId,
      regionId,
      city,
      sex,
      vaccinated,
      title,
      description,
      priceAmount,
      expectedPrice,
      ageMonths,
      weightKg,
      quantity,
      isNegotiable,
      allowPriceOffers,
      status,
      subCategoryId,
      images,
      imageUrls,
      video,
      videoMediaId,
    } = req.body || {};

    // Security & moderation lifecycle rules
    let nextStatus = existing.status;
    if (status !== undefined) {
      if (isAdmin(currentUser)) {
        if (['Published', 'Pending', 'Rejected', 'Sold', 'Draft', 'Expired'].includes(String(status))) {
          nextStatus = String(status);
        } else {
          return res.status(400).json({ error: 'حالة الإعلان المطلوبة غير صالحة', code: 'invalid_status' });
        }
      } else if (status === 'Sold') {
        if (existing.status !== 'Published' && existing.status !== 'Sold') {
          return res.status(400).json({
            error: 'يمكن تحديد الإعلان كمباع بعد اعتماده ونشره فقط',
            code: 'invalid_status',
          });
        }
        nextStatus = 'Sold';
      } else if (status === 'Draft' || status === 'Pending') {
        nextStatus = String(status);
      } else if (status === 'Published' && existing.status !== 'Published') {
        return res.status(403).json({
          error: 'لا يمكن نشر الإعلان أو إعادة نشر إعلان مرفوض دون موافقة المشرف',
          code: 'moderation_required',
        });
      } else if (status === 'Rejected') {
        return res.status(403).json({ error: 'صلاحيات المشرف مطلوبة لهذا الإجراء', code: 'forbidden' });
      } else if (status !== existing.status) {
        return res.status(400).json({ error: 'حالة الإعلان المطلوبة غير صالحة', code: 'invalid_status' });
      }
    }

    const nextTitle =
      title !== undefined
        ? validateRequiredText(title, {
            label: 'عنوان الإعلان',
            minLength: INPUT_LIMITS.listingTitleMin,
            maxLength: INPUT_LIMITS.listingTitleMax,
            code: 'invalid_title',
          })
        : existing.title;
    const nextDescription =
      description !== undefined
        ? validateOptionalText(description, {
            label: 'وصف الإعلان',
            maxLength: INPUT_LIMITS.listingDescriptionMax,
            allowNewlines: true,
            defaultValue: '',
            code: 'invalid_description',
          })
        : existing.description;
    const nextCity =
      city !== undefined
        ? validateRequiredText(city, {
            label: 'المدينة',
            minLength: INPUT_LIMITS.listingCityMin,
            maxLength: INPUT_LIMITS.listingCityMax,
            code: 'invalid_city',
          })
        : existing.city;

    let nextBreedId = existing.breedId;
    if (breedId !== undefined) {
      if (typeof breedId !== 'string' || !store.breeds.some((b) => b.id === breedId.trim())) {
        return res.status(400).json({ error: 'السلالة المحددة غير صالحة', code: 'invalid_breed' });
      }
      nextBreedId = breedId.trim();
    }

    let nextRegionId = existing.regionId;
    if (regionId !== undefined) {
      if (typeof regionId !== 'string' || !store.regions.some((r) => r.id === regionId.trim())) {
        return res.status(400).json({ error: 'المنطقة المحددة غير صالحة', code: 'invalid_region' });
      }
      nextRegionId = regionId.trim();
    }

    let nextCategoryId = existing.categoryId;
    if (categoryId !== undefined) {
      if (
        typeof categoryId !== 'string' ||
        !store.categories.some((c) => c.id === categoryId.trim() && c.parentId === null)
      ) {
        return res.status(400).json({ error: 'التصنيف الرئيسي المحدد غير صالح', code: 'invalid_category' });
      }
      nextCategoryId = categoryId.trim();
    }

    let nextSex = existing.sex;
    if (sex !== undefined) {
      const allowedSexes = new Set(['ذكر', 'أنثى', 'قطيع مختلط']);
      if (typeof sex !== 'string' || !allowedSexes.has(sex)) {
        return res.status(400).json({ error: 'قيمة الجنس غير صالحة', code: 'invalid_sex' });
      }
      nextSex = sex;
    }

    const nextPriceAmount =
      priceAmount !== undefined
        ? parseFinitePositiveNumber(priceAmount, {
            label: 'السعر المطلوب للرأس',
            max: INPUT_LIMITS.listingPriceMax,
            code: 'invalid_price',
          })
        : existing.priceAmount;

    let nextExpectedPrice = existing.expectedPrice;
    if (expectedPrice !== undefined) {
      const expectedCheck = validateExpectedPriceRule({
        priceAmount: nextPriceAmount,
        expectedPrice,
      });
      if (!expectedCheck.ok) {
        return res.status(400).json({ error: expectedCheck.error, code: 'invalid_expected_price' });
      }
      nextExpectedPrice = expectedCheck.value;
    } else if (
      priceAmount !== undefined &&
      existing.expectedPrice !== null &&
      existing.expectedPrice !== undefined &&
      Number(existing.expectedPrice) > nextPriceAmount
    ) {
      return res.status(400).json({
        error: 'السعر المتوقع للتفاوض يجب أن يكون مساوياً أو أقل من السعر المطلوب للرأس',
        code: 'invalid_expected_price',
      });
    }

    const nextAgeMonths =
      ageMonths !== undefined
        ? parsePositiveInteger(ageMonths, {
            label: 'العمر بالأشهر',
            min: INPUT_LIMITS.listingAgeMin,
            max: INPUT_LIMITS.listingAgeMax,
            code: 'invalid_age',
          })
        : existing.ageMonths;
    const nextWeightKg =
      weightKg !== undefined
        ? parseFinitePositiveNumber(weightKg, {
            label: 'الوزن التقريبي',
            minInclusive: INPUT_LIMITS.listingWeightMin,
            max: INPUT_LIMITS.listingWeightMax,
            code: 'invalid_weight',
          })
        : existing.weightKg;
    const nextQuantity =
      quantity !== undefined
        ? parsePositiveInteger(quantity, {
            label: 'الكمية',
            min: 1,
            max: INPUT_LIMITS.listingQuantityMax,
            code: 'invalid_quantity',
          })
        : existing.quantity;

    let nextSubCategoryId = existing.subCategoryId;
    if (subCategoryId !== undefined) {
      if (subCategoryId === 'auto') {
        nextSubCategoryId = inferSubCategoryId(
          {
            title: nextTitle,
            description: nextDescription,
            sex: nextSex,
            ageMonths: nextAgeMonths,
            categoryId: nextCategoryId,
          },
          store.categories
        );
      } else if (subCategoryId === null || subCategoryId === '') {
        nextSubCategoryId = null;
      } else if (
        typeof subCategoryId === 'string' &&
        store.categories.some((c) => c.id === subCategoryId.trim() && c.parentId !== null)
      ) {
        nextSubCategoryId = subCategoryId.trim();
      } else {
        return res.status(400).json({ error: 'الفئة الفرعية المحددة غير صالحة', code: 'invalid_subcategory' });
      }
    }

    const nextVaccinated = vaccinated !== undefined ? Boolean(vaccinated) : existing.vaccinated;

    let nextImages = existing.images;
    let nextVideo = existing.video ?? null;
    const hasMediaPayload =
      images !== undefined ||
      imageUrls !== undefined ||
      video !== undefined ||
      videoMediaId !== undefined;
    const incomingImages = hasMediaPayload
      ? images !== undefined
        ? images
        : imageUrls !== undefined
        ? imageUrls
        : existing.images
      : undefined;
    const incomingVideo = hasMediaPayload
      ? video !== undefined
        ? video
        : videoMediaId !== undefined
        ? videoMediaId
        : existing.video
      : undefined;
    const candidateMediaIds = hasMediaPayload
      ? collectCandidateMediaIds(incomingImages, incomingVideo)
      : [];
    for (const id of candidateMediaIds) inFlightMediaIds.add(id);

    try {
      if (hasMediaPayload) {
        const breed = store.breeds.find((b) => b.id === nextBreedId);
        const fallbackUrl = breed?.imageUrl || IMG.naimi;

        let resolvedMedia: ReturnType<typeof resolveListingMedia>;
        try {
          resolvedMedia = resolveListingMedia({
            actorId: currentUser.id,
            actorIsAdmin: isAdmin(currentUser),
            targetListingId: existing.id,
            mediaStore: store.media || [],
            imageInputs: incomingImages,
            videoInput: incomingVideo,
            fallbackImageUrl: fallbackUrl,
          });
        } catch (err) {
          if (err instanceof MediaUploadError) {
            return res.status(err.status).json({ error: err.message, code: err.code });
          }
          throw err;
        }

        for (const asset of store.media || []) {
          if (asset.listingId === existing.id && !resolvedMedia.boundMediaIds.has(asset.id)) {
            asset.listingId = null;
          }
          if (resolvedMedia.boundMediaIds.has(asset.id)) {
            asset.listingId = existing.id;
          }
        }

        nextImages = resolvedMedia.images;
        nextVideo = resolvedMedia.video;
      }

      const materialChanged = hasMaterialListingChanges(existing, {
        categoryId: nextCategoryId,
        subCategoryId: nextSubCategoryId,
        breedId: nextBreedId,
        regionId: nextRegionId,
        city: nextCity,
        title: nextTitle,
        description: nextDescription,
        priceAmount: nextPriceAmount,
        expectedPrice: nextExpectedPrice,
        sex: nextSex,
        ageMonths: nextAgeMonths,
        weightKg: nextWeightKg,
        quantity: nextQuantity,
        vaccinated: nextVaccinated,
        images: nextImages,
        video: nextVideo,
      });

      let nextRejectionReason = existing.rejectionReason;
      if (!isAdmin(currentUser)) {
        if (existing.status === 'Published' && materialChanged && nextStatus === 'Published') {
          nextStatus = 'Pending';
          nextRejectionReason = undefined;
        } else if (
          (existing.status === 'Rejected' || existing.status === 'Expired') &&
          status !== 'Draft'
        ) {
          nextStatus = 'Pending';
          nextRejectionReason = undefined;
        } else if (nextStatus === 'Pending') {
          nextRejectionReason = undefined;
        }
      } else if (nextStatus !== 'Rejected') {
        nextRejectionReason = undefined;
      }

      const updated = {
        ...existing,
        categoryId: nextCategoryId,
        breedId: nextBreedId,
        regionId: nextRegionId,
        city: nextCity,
        sex: nextSex,
        vaccinated: nextVaccinated,
        title: nextTitle,
        description: nextDescription,
        priceAmount: nextPriceAmount,
        expectedPrice: nextExpectedPrice,
        ageMonths: nextAgeMonths,
        weightKg: nextWeightKg,
        quantity: nextQuantity,
        isNegotiable: isNegotiable !== undefined ? Boolean(isNegotiable) : existing.isNegotiable,
        allowPriceOffers:
          allowPriceOffers !== undefined ? Boolean(allowPriceOffers) : existing.allowPriceOffers,
        subCategoryId: nextSubCategoryId,
        images: nextImages,
        video: nextVideo,
        status: nextStatus,
        rejectionReason: nextRejectionReason,
        updatedAt: new Date().toISOString(),
      };

      store.listings[idx] = updated;
      saveStore(store);
      res.json({ listing: attachLikesCountToListing(updated, store.likes) });
    } finally {
      for (const id of candidateMediaIds) inFlightMediaIds.delete(id);
    }
  });

  // POST /api/v1/favorites/toggle
  app.post('/api/v1/favorites/toggle', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        favoriteLimiter,
        `fav:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتحديث المفضلة مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const rawListingId = req.body?.listingId;
    if (typeof rawListingId !== 'string' || !rawListingId.trim()) {
      return res.status(400).json({ error: 'معرف الإعلان مطلوب' });
    }
    const listingId = rawListingId.trim();

    const currentFavs = store.favorites[currentUser.id] || [];
    const exists = currentFavs.includes(listingId);
    if (!exists) {
      const listing = store.listings.find((l) => l.id === listingId);
      if (!listing || !canViewListing(currentUser, listing)) {
        return res.status(404).json({ error: 'الإعلان غير موجود' });
      }
      if (listing.status !== 'Published') {
        return res.status(400).json({
          error: 'يمكن حفظ الإعلانات المنشورة فقط في المفضلة',
          code: 'listing_not_published',
        });
      }
      if (isUserSuspended(listing.sellerId)) {
        return res.status(403).json({
          error: 'هذا الحساب موقوف حالياً ولا يمكن حفظ إعلانه في المفضلة',
          code: 'seller_suspended',
        });
      }
    }

    const nextFavs = exists ? currentFavs.filter((id) => id !== listingId) : [...currentFavs, listingId];
    store.favorites[currentUser.id] = nextFavs;
    saveStore(store);
    res.json({ favoriteIds: nextFavs, isFavorite: !exists });
  });

  // Conversations & Messaging
  app.post('/api/v1/conversations', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        conversationStartLimiter,
        `conv:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لبدء المحادثات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const { listingId: rawListingId, initialMessage } = req.body || {};
    if (typeof rawListingId !== 'string' || !rawListingId.trim()) {
      return res.status(400).json({ error: 'معرف الإعلان مطلوب' });
    }
    const listingId = rawListingId.trim();

    const listing = store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    if (listing.sellerId === currentUser.id) {
      return res.status(400).json({ error: 'لا يمكنك بدء محادثة على إعلانك الخاص' });
    }
    if (listing.status !== 'Published') {
      return res.status(400).json({
        error: 'لا يمكن بدء محادثة على إعلان غير منشور',
        code: 'listing_not_published',
      });
    }
    const sellerUser = store.users.find((u) => u.id === listing.sellerId);
    if (!sellerUser || sellerUser.status === 'suspended') {
      return res.status(403).json({
        error: 'لا يمكن التواصل مع هذا الحساب حالياً',
        code: 'seller_suspended',
      });
    }

    const cleanInitial = validateOptionalText(initialMessage, {
      label: 'نص الرسالة',
      maxLength: INPUT_LIMITS.messageBodyMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_message_body',
    });

    let conv = store.conversations.find(
      (c) => c.listingId === listingId && c.buyerId === currentUser.id
    );

    const nowIso = new Date().toISOString();
    if (!conv) {
      conv = {
        id: `conv_${crypto.randomUUID().slice(0, 6)}`,
        listingId,
        buyerId: currentUser.id,
        sellerId: listing.sellerId,
        updatedAt: nowIso,
        readAtByUserId: { [currentUser.id]: nowIso },
        messages: [],
      };
      store.conversations.unshift(conv);
    }

    if (cleanInitial) {
      const msgIso = new Date().toISOString();
      conv.messages.push({
        id: `msg_${crypto.randomUUID().slice(0, 6)}`,
        conversationId: conv.id,
        senderId: currentUser.id,
        body: cleanInitial,
        createdAt: msgIso,
      });
      conv.updatedAt = msgIso;
      conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: msgIso };
      markConversationMessageNotificationsRead(currentUser.id, conv.id);

      const recipientId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
      if (recipientId && recipientId !== currentUser.id) {
        pushNotification({
          userId: recipientId,
          type: 'new_message',
          title: `رسالة جديدة من ${currentUser.name}`,
          body: cleanInitial.slice(0, 90),
          listingId: conv.listingId,
          conversationId: conv.id,
        });
        emitToUser(recipientId, {
          type: 'conversation:updated',
          conversation: toUserConversation(conv, recipientId, store),
        });
      }
    }

    saveStore(store);
    res.json({ conversation: toUserConversation(conv, currentUser.id, store) });
  });

  app.post('/api/v1/conversations/:id/messages', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        messageLimiter,
        `msg:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لإرسال الرسائل مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const conv = store.conversations.find((c) => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    // Conversations are private to their two participants (admins included).
    if (!canAccessConversation(currentUser, conv)) {
      return res.status(403).json({ error: 'غير مصرح لك بالوصول لهذه المحادثة' });
    }
    const recipientId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
    if (recipientId && isUserSuspended(recipientId)) {
      return res.status(403).json({
        error: 'لا يمكن إرسال رسائل لهذا الحساب لأنه موقوف حالياً',
        code: 'seller_suspended',
      });
    }
    const cleanBody = validateRequiredText(req.body?.body, {
      label: 'نص الرسالة',
      minLength: INPUT_LIMITS.messageBodyMin,
      maxLength: INPUT_LIMITS.messageBodyMax,
      allowNewlines: true,
      code: 'invalid_message_body',
    });

    const message = {
      id: `msg_${crypto.randomUUID().slice(0, 6)}`,
      conversationId: conv.id,
      senderId: currentUser.id,
      body: cleanBody,
      createdAt: new Date().toISOString(),
    };
    conv.messages.push(message);
    conv.updatedAt = message.createdAt;
    conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: message.createdAt };
    markConversationMessageNotificationsRead(currentUser.id, conv.id);

    if (recipientId && recipientId !== currentUser.id) {
      pushNotification({
        userId: recipientId,
        type: 'new_message',
        title: `رسالة جديدة من ${currentUser.name}`,
        body: message.body.slice(0, 90),
        listingId: conv.listingId,
        conversationId: conv.id,
      });
      emitToUser(recipientId, {
        type: 'conversation:updated',
        conversation: toUserConversation(conv, recipientId, store),
      });
    }

    saveStore(store);
    res.status(201).json({
      message,
      conversation: toUserConversation(conv, currentUser.id, store),
    });
  });

  app.post('/api/v1/conversations/:id/read', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        readReceiptLimiter,
        `read:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتحديث حالة القراءة مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    const conv = store.conversations.find((c) => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    if (!canAccessConversation(currentUser, conv)) {
      return res.status(403).json({ error: 'غير مصرح لك بالوصول لهذه المحادثة' });
    }

    const nowIso = new Date().toISOString();
    conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: nowIso };
    markConversationMessageNotificationsRead(currentUser.id, conv.id);

    saveStore(store);
    res.json({ conversation: toUserConversation(conv, currentUser.id, store) });
  });

  // Price Offers / Negotiation Endpoints
  app.post('/api/v1/listings/:id/offers', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        offerLimiter,
        `offer:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لتقديم عروض الأسعار مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }

    if (listing.sellerId === currentUser.id) {
      return res.status(400).json({ error: 'لا يمكنك تقديم عرض سعر على إعلانك الخاص' });
    }

    if (listing.status !== 'Published') {
      return res.status(400).json({
        error: 'يمكن تقديم عروض الأسعار على الإعلانات المنشورة فقط',
        code: 'listing_not_published',
      });
    }

    const sellerUser = store.users.find((u) => u.id === listing.sellerId);
    if (!sellerUser || sellerUser.status === 'suspended') {
      return res.status(403).json({
        error: 'لا يمكن تقديم عروض لهذا الحساب حالياً',
        code: 'seller_suspended',
      });
    }

    const offersAllowed =
      listing.allowPriceOffers !== undefined ? listing.allowPriceOffers : listing.isNegotiable;
    if (!offersAllowed) {
      return res.status(400).json({ error: 'هذا الإعلان بسعر نهائي ولا يقبل عروض الأسعار' });
    }

    const offeredPrice = parseFinitePositiveNumber(req.body?.offeredPrice, {
      label: 'قيمة العرض',
      max: INPUT_LIMITS.offerPriceMax,
      code: 'invalid_offer_price',
    });
    const maxQty = Math.max(1, Number(listing.quantity) || 1);
    const rawQty = req.body?.quantity === undefined || req.body?.quantity === null ? 1 : req.body?.quantity;
    const quantity = parsePositiveInteger(rawQty, {
      label: 'الكمية',
      min: 1,
      max: maxQty,
      code: 'invalid_offer_quantity',
    });
    const note = validateOptionalText(req.body?.note, {
      label: 'ملاحظات العرض',
      maxLength: INPUT_LIMITS.offerNoteMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_offer_note',
    });

    const nowIso = new Date().toISOString();
    const offer = {
      id: `off_${crypto.randomUUID().slice(0, 6)}`,
      listingId: listing.id,
      buyerId: currentUser.id,
      buyerName: currentUser.name,
      sellerId: listing.sellerId,
      offeredPrice,
      quantity,
      note,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.priceOffers = store.priceOffers || [];
    store.priceOffers.unshift(offer);

    // Notify seller inside direct conversations as well
    let conv = store.conversations.find(
      (c) => c.listingId === listing.id && c.buyerId === currentUser.id
    );
    if (!conv) {
      conv = {
        id: `conv_${crypto.randomUUID().slice(0, 6)}`,
        listingId: listing.id,
        buyerId: currentUser.id,
        sellerId: listing.sellerId,
        updatedAt: nowIso,
        readAtByUserId: { [currentUser.id]: nowIso },
        messages: [],
      };
      store.conversations.unshift(conv);
    }
    const offerMsgBody = `تقديم عرض سعر جديد: ${offeredPrice.toLocaleString('en-US')} ر.س للرأس (الكمية: ${offer.quantity})${note ? ` — ${note}` : ''}`;
    conv.messages.push({
      id: `msg_${crypto.randomUUID().slice(0, 6)}`,
      conversationId: conv.id,
      senderId: currentUser.id,
      body: offerMsgBody,
      createdAt: nowIso,
    });
    conv.updatedAt = nowIso;
    conv.readAtByUserId = { ...(conv.readAtByUserId || {}), [currentUser.id]: nowIso };

    if (listing.sellerId !== currentUser.id) {
      pushNotification({
        userId: listing.sellerId,
        type: 'new_message',
        title: `عرض سعر ورسالة جديدة من ${currentUser.name}`,
        body: offerMsgBody,
        listingId: listing.id,
        conversationId: conv.id,
      });
      emitToUser(listing.sellerId, {
        type: 'conversation:updated',
        conversation: toUserConversation(conv, listing.sellerId, store),
      });
    }

    saveStore(store);
    res.status(201).json({ offer });
  });

  app.post('/api/v1/offers/:id/respond', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        offerRespondLimiter,
        `offer-resp:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح للرد على العروض مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const offer = (store.priceOffers || []).find((o) => o.id === req.params.id);
    if (!offer) return res.status(404).json({ error: 'عرض السعر غير موجود' });

    if (!canRespondToOffer(currentUser, offer)) {
      return res.status(403).json({ error: 'صلاحية البائع مطلوبة للرد على عرض السعر' });
    }

    const rawStatus = req.body?.status;
    if (rawStatus !== 'accepted' && rawStatus !== 'rejected') {
      return res.status(400).json({ error: 'حالة الرد على العرض يجب أن تكون accepted أو rejected' });
    }
    const nextStatus = rawStatus;
    offer.status = nextStatus;
    offer.updatedAt = new Date().toISOString();

    const listing = store.listings.find((l) => l.id === offer.listingId);
    const listingTitle = listing?.title || 'الإعلان';
    if (nextStatus === 'accepted') {
      pushNotification({
        userId: offer.buyerId,
        type: 'offer_accepted',
        title: 'تم قبول عرض السعر الخاص بك',
        body: `وافق المربي على عرضك بقيمة ${Number(offer.offeredPrice).toLocaleString('en-US')} ر.س على إعلان «${listingTitle}».`,
        listingId: offer.listingId,
      });
    } else {
      pushNotification({
        userId: offer.buyerId,
        type: 'offer_rejected',
        title: 'تحديث على عرض السعر',
        body: `تم الاعتذار عن عرضك على إعلان «${listingTitle}». يمكنك تقديم عرض جديد أو التواصل مع المربي.`,
        listingId: offer.listingId,
      });
    }
    emitToUser(offer.buyerId, { type: 'offer:updated', offer });

    if (isAdmin(currentUser)) {
      store.auditLogs.unshift({
        id: `aud_${crypto.randomUUID().slice(0, 6)}`,
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: nextStatus === 'accepted' ? 'قبول عرض سعر' : 'رفض عرض سعر',
        targetType: 'offer',
        targetId: offer.id,
        note: `${offer.offeredPrice} ر.س`,
        createdAt: offer.updatedAt,
      });
    }

    saveStore(store);
    res.json({ offer });
  });

  // Seller Self-Service Verification Status & Re-submission
  app.get('/api/v1/seller/verification', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const seller = store.sellers.find((s) => s.userId === currentUser.id);
    if (!seller) {
      return res.json({ seller: null });
    }
    const status = resolveSellerVerificationStatus(seller);
    res.json({
      seller: {
        userId: seller.userId,
        displayName: seller.displayName,
        verificationStatus: status,
        verifiedAt: status === 'Verified' ? seller.verifiedAt || null : null,
        verificationNote: seller.verificationNote || null,
        verificationRequestedAt: seller.verificationRequestedAt || null,
        verificationReviewedAt: seller.verificationReviewedAt || null,
      },
    });
  });

  app.post('/api/v1/seller/verification/request', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        verificationRequestLimiter,
        `verify-req:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لطلبات التوثيق مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }
    let seller = store.sellers.find((s) => s.userId === currentUser.id);
    const nowIso = new Date().toISOString();

    if (!seller) {
      if (currentUser.role !== 'seller' && !store.listings.some((l) => l.sellerId === currentUser.id)) {
        return res.status(403).json({ error: 'طلب التوثيق متاح لحسابات البائعين والمربين فقط' });
      }
      seller = {
        userId: currentUser.id,
        displayName: `مراح ${currentUser.name}`,
        bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
        regionId: 'reg_riyadh',
        city: 'الرياض',
        phone: currentUser.phone,
        whatsapp: `966${currentUser.phone.replace(/^0/, '')}`,
        verificationStatus: 'Pending',
        verifiedAt: null,
        verificationNote: null,
        verificationRequestedAt: nowIso,
        verificationReviewedAt: null,
        yearsExperience: 2,
        specialty: 'أغنام وماعز',
        rating: 0,
        ratingCount: 0,
        totalSales: 0,
      };
      store.sellers.push(seller);
    } else {
      const currentStatus = resolveSellerVerificationStatus(seller);
      if (currentStatus === 'Verified') {
        return res.status(400).json({ error: 'حساب المربي موثق بالفعل' });
      }
      seller.verificationStatus = 'Pending';
      seller.verifiedAt = null;
      seller.verificationNote = null;
      seller.verificationRequestedAt = nowIso;
    }

    saveStore(store);
    res.json({
      seller: {
        userId: seller.userId,
        displayName: seller.displayName,
        verificationStatus: seller.verificationStatus,
        verifiedAt: seller.verifiedAt,
        verificationNote: seller.verificationNote,
        verificationRequestedAt: seller.verificationRequestedAt,
        verificationReviewedAt: seller.verificationReviewedAt,
      },
    });
  });

  // Reports (Listings & Comments)
  app.post('/api/v1/reports', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    if (
      !enforceRateLimit(
        reportLimiter,
        `report:${currentUser.id}`,
        res,
        'تجاوزت الحد المسموح لإرسال البلاغات مؤقتاً، حاول بعد قليل'
      )
    ) {
      return;
    }

    const { listingId: rawListingId, commentId, reason, details } = req.body || {};
    if (typeof rawListingId !== 'string' || !rawListingId.trim()) {
      return res.status(400).json({ error: 'معرف الإعلان مطلوب' });
    }
    const listingId = rawListingId.trim();

    const cleanReason = validateRequiredText(reason, {
      label: 'سبب البلاغ',
      minLength: INPUT_LIMITS.reportReasonMin,
      maxLength: INPUT_LIMITS.reportReasonMax,
      code: 'invalid_report_reason',
    });
    const cleanDetails = validateOptionalText(details, {
      label: 'تفاصيل البلاغ',
      maxLength: INPUT_LIMITS.reportDetailsMax,
      allowNewlines: true,
      defaultValue: '',
      code: 'invalid_report_details',
    });

    const listing = store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }

    const cleanCommentId = typeof commentId === 'string' && commentId.trim() ? commentId.trim() : null;
    const targetType: 'listing' | 'comment' = cleanCommentId ? 'comment' : 'listing';
    if (cleanCommentId) {
      if (listing.status !== 'Published') {
        return res.status(404).json({ error: 'التعليق غير موجود' });
      }
      const targetComment = (store.comments || []).find(
        (c) => c.id === cleanCommentId && c.listingId === listing.id
      );
      if (!targetComment) {
        return res.status(404).json({ error: 'التعليق غير موجود' });
      }
      if (targetComment.authorId === currentUser.id) {
        return res.status(400).json({ error: 'لا يمكنك الإبلاغ عن تعليقك الشخصي' });
      }
    }

    const duplicateOpen = (store.reports || []).some((r) => {
      const normalized = normalizeReportRecord(r);
      return (
        normalized.status === 'open' &&
        normalized.reporterId === currentUser.id &&
        normalized.targetType === targetType &&
        normalized.listingId === listing.id &&
        normalized.commentId === cleanCommentId
      );
    });
    if (duplicateOpen) {
      return res.status(409).json({ error: 'تم إرسال بلاغ مماثل مسبقاً وهو قيد المراجعة' });
    }

    const report = {
      id: `rep_${crypto.randomUUID().slice(0, 6)}`,
      targetType,
      reporterId: currentUser.id,
      listingId: listing.id,
      commentId: cleanCommentId,
      reason: cleanReason,
      details: cleanDetails,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolutionNote: null,
    };
    store.reports.unshift(report);
    saveStore(store);
    res.status(201).json({ report });
  });

  // Admin Overview & Management Endpoints (strictly guarded by requireAdmin)
  app.get('/api/v1/admin/overview', requireAdmin, (_req, res) => {
    res.json({ overview: buildAdminOverview(store) });
  });

  app.get('/api/v1/admin/users', requireAdmin, (req, res) => {
    const summaries = store.users.map((user) => {
      const seller = store.sellers.find((s) => s.userId === user.id);
      return toAdminUserSummary(user, seller, store.listings);
    });
    const filtered = filterAdminUsers(summaries, {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      role: typeof req.query.role === 'string' ? req.query.role : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      verificationStatus:
        typeof req.query.verificationStatus === 'string'
          ? req.query.verificationStatus
          : undefined,
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paged = paginateAdminItems(filtered, req.query, { defaultLimit: 50, maxLimit: 100 });
    res.json({
      users: paged.items,
      total: paged.totalCount,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    });
  });

  app.post('/api/v1/admin/users/:id/suspend', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const targetUser = store.users.find((u) => u.id === req.params.id);
    try {
      const { auditEntry } = applyUserSuspension({
        actor: currentUser,
        actorName: currentUser.name,
        targetUser,
        allUsers: store.users,
        reason: req.body?.reason,
      });
      // Immediately terminate all active sessions and live WebSocket connections for the suspended account.
      sessions.revokeAllForUser(targetUser.id);
      store.auditLogs.unshift(auditEntry);
      saveStore(store);
      const seller = store.sellers.find((s) => s.userId === targetUser.id);
      res.json({ user: toAdminUserSummary(targetUser, seller, store.listings), auditEntry });
    } catch (err) {
      if (err instanceof AdminValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  });

  app.post('/api/v1/admin/users/:id/reactivate', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const targetUser = store.users.find((u) => u.id === req.params.id);
    try {
      const { auditEntry } = applyUserReactivation({
        actor: currentUser,
        actorName: currentUser.name,
        targetUser,
        reason: req.body?.reason,
      });
      store.auditLogs.unshift(auditEntry);
      saveStore(store);
      const seller = store.sellers.find((s) => s.userId === targetUser.id);
      res.json({ user: toAdminUserSummary(targetUser, seller, store.listings), auditEntry });
    } catch (err) {
      if (err instanceof AdminValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  });

  app.get('/api/v1/admin/sellers', requireAdmin, (req, res) => {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const items = store.users
      .filter((u) => store.sellers.some((s) => s.userId === u.id))
      .map((u) => {
        const seller = store.sellers.find((s) => s.userId === u.id);
        return toAdminUserSummary(u, seller, store.listings);
      })
      .filter((summary) => {
        if (!summary.sellerProfile) return false;
        if (
          statusFilter &&
          statusFilter !== 'all' &&
          summary.sellerProfile.verificationStatus !== statusFilter
        ) {
          return false;
        }
        if (!q) return true;
        return (
          summary.name.toLowerCase().includes(q) ||
          summary.phone.toLowerCase().includes(q) ||
          summary.sellerProfile.displayName.toLowerCase().includes(q) ||
          summary.sellerProfile.city.toLowerCase().includes(q)
        );
      });

    const paged = paginateAdminItems(items, req.query, { defaultLimit: 50, maxLimit: 100 });
    res.json({
      sellers: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    });
  });

  app.post('/api/v1/admin/sellers/:userId/verification', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const targetUser = store.users.find((u) => u.id === req.params.userId);
    const seller = store.sellers.find((s) => s.userId === req.params.userId);
    if (!targetUser || !seller) {
      return res.status(404).json({ error: 'ملف المربي غير موجود' });
    }

    try {
      const { verificationStatus, auditEntry } = applySellerVerificationDecision({
        actor: currentUser,
        actorName: currentUser.name,
        seller,
        targetUserName: targetUser.name,
        status: req.body?.status,
        reason: req.body?.reason,
      });

      if (verificationStatus === 'Verified') {
        pushNotification({
          userId: seller.userId,
          type: 'seller_verified',
          title: 'تم توثيق حسابك كمربي معتمد',
          body: `أصبح حساب «${seller.displayName}» يحمل شارة المربي الموثق في السوق.`,
        });
      } else if (verificationStatus === 'Rejected') {
        pushNotification({
          userId: seller.userId,
          type: 'seller_verification_rejected',
          title: 'تحديث حول طلب توثيق المربي',
          body: seller.verificationNote
            ? `لم يتم اعتماد التوثيق حالياً: ${seller.verificationNote}`
            : 'لم يتم اعتماد طلب التوثيق حالياً، يرجى مراجعة بيانات المراح.',
        });
      }

      store.auditLogs.unshift(auditEntry);
      saveStore(store);
      res.json({
        user: toAdminUserSummary(targetUser, seller, store.listings),
        seller: toPublicSeller(seller, isSellerContactAvailable(seller)),
        auditEntry,
      });
    } catch (err) {
      if (err instanceof AdminValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  });

  app.get('/api/v1/admin/reports', requireAdmin, (req, res) => {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
    const targetTypeFilter =
      typeof req.query.targetType === 'string' ? req.query.targetType : 'all';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const items = (store.reports || [])
      .map((r) => toAdminReportItem(r, store))
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (targetTypeFilter !== 'all' && item.targetType !== targetTypeFilter) return false;
        if (!q) return true;
        return (
          item.reason.toLowerCase().includes(q) ||
          item.details.toLowerCase().includes(q) ||
          item.reporterName.toLowerCase().includes(q) ||
          (item.listingTitle || '').toLowerCase().includes(q) ||
          (item.commentBody || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paged = paginateAdminItems(items, req.query, { defaultLimit: 50, maxLimit: 100 });
    res.json({
      reports: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    });
  });

  app.post('/api/v1/admin/reports/:id/resolve', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const report = store.reports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'البلاغ غير موجود' });

    let resolutionNote: string | null = null;
    try {
      resolutionNote = validateAdminNote(req.body?.note, {
        required: false,
        label: 'ملاحظة الإجراء',
        minLength: 2,
        maxLength: 300,
      });
    } catch (err) {
      if (err instanceof AdminValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    const nowIso = new Date().toISOString();
    report.targetType = report.targetType === 'comment' || report.commentId ? 'comment' : 'listing';
    report.status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
    report.resolvedAt = nowIso;
    report.resolvedBy = currentUser.id;
    report.resolutionNote = resolutionNote;

    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: report.status === 'resolved' ? 'معالجة بلاغ' : 'إغلاق بلاغ',
        targetType: 'report',
        targetId: report.id,
        note: resolutionNote ? `${report.reason} — ${resolutionNote}` : report.reason,
        createdAt: nowIso,
      })
    );
    saveStore(store);
    res.json({ report: toAdminReportItem(report, store) });
  });

  app.get('/api/v1/admin/audit-logs', requireAdmin, (req, res) => {
    const targetTypeFilter =
      typeof req.query.targetType === 'string' ? req.query.targetType : 'all';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const filteredLogs = (store.auditLogs || []).filter((log) => {
      if (targetTypeFilter !== 'all' && log.targetType !== targetTypeFilter) return false;
      if (!q) return true;
      return (
        String(log.action || '').toLowerCase().includes(q) ||
        String(log.actorName || '').toLowerCase().includes(q) ||
        String(log.note || '').toLowerCase().includes(q) ||
        String(log.targetId || '').toLowerCase().includes(q)
      );
    });

    const paged = paginateAdminItems(filteredLogs, req.query, { defaultLimit: 50, maxLimit: 200 });
    res.json({
      auditLogs: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    });
  });

  app.post('/api/v1/admin/listings/:id/approve', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'الإعلان غير موجود' });

    const nowIso = new Date().toISOString();
    listing.status = 'Published';
    listing.rejectionReason = undefined;
    listing.publishedAt = nowIso;
    listing.updatedAt = nowIso;

    if (listing.sellerId !== currentUser.id) {
      pushNotification({
        userId: listing.sellerId,
        type: 'listing_approved',
        title: 'تم اعتماد ونشر إعلانك',
        body: `تمت الموافقة على إعلان «${listing.title}» ونشره في السوق.`,
        listingId: listing.id,
      });
    }

    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'اعتماد ونشر إعلان',
        targetType: 'listing',
        targetId: listing.id,
        note: listing.title,
        createdAt: nowIso,
      })
    );

    saveStore(store);
    res.json({ listing: attachLikesCountToListing(listing, store.likes) });
  });

  app.post('/api/v1/admin/listings/:id/reject', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'الإعلان غير موجود' });

    let cleanReason: string | null;
    try {
      cleanReason = validateAdminNote(req.body?.reason, {
        required: true,
        label: 'سبب رفض الإعلان',
        minLength: 3,
        maxLength: 400,
      });
    } catch (err) {
      if (err instanceof AdminValidationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    const nowIso = new Date().toISOString();
    listing.status = 'Rejected';
    listing.rejectionReason = cleanReason!;
    listing.updatedAt = nowIso;

    if (listing.sellerId !== currentUser.id) {
      pushNotification({
        userId: listing.sellerId,
        type: 'listing_rejected',
        title: 'تحديث على حالة إعلانك',
        body: `لم يُعتمد إعلان «${listing.title}» — السبب: ${listing.rejectionReason}`,
        listingId: listing.id,
      });
    }

    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'رفض إعلان',
        targetType: 'listing',
        targetId: listing.id,
        note: `${listing.title} — ${listing.rejectionReason}`,
        createdAt: nowIso,
      })
    );

    saveStore(store);
    res.json({ listing: attachLikesCountToListing(listing, store.likes) });
  });

  app.post('/api/v1/admin/breeds', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const { name, categoryId, origin, summary, avgWeightKg, priceRangeSar } = req.body || {};
    const cleanName = validateRequiredText(name, {
      label: 'اسم السلالة',
      minLength: INPUT_LIMITS.breedNameMin,
      maxLength: INPUT_LIMITS.breedNameMax,
      code: 'invalid_breed_name',
    });
    if (
      typeof categoryId !== 'string' ||
      !store.categories.some((c) => c.id === categoryId.trim() && c.parentId === null)
    ) {
      return res.status(400).json({ error: 'التصنيف الرئيسي المحدد غير صالح', code: 'invalid_category' });
    }
    const cleanOrigin = validateOptionalText(origin, {
      label: 'المنشأ',
      maxLength: INPUT_LIMITS.breedFieldMax,
      defaultValue: 'المملكة العربية السعودية',
    });
    const cleanSummary = validateOptionalText(summary, {
      label: 'الوصف',
      maxLength: INPUT_LIMITS.breedFieldMax,
      allowNewlines: true,
      defaultValue: 'سلالة مضافة عبر إدارة المنصة.',
    });
    const cleanAvgWeight = validateOptionalText(avgWeightKg, {
      label: 'متوسط الوزن',
      maxLength: INPUT_LIMITS.breedFieldMax,
      defaultValue: '35 – 55 كجم',
    });
    const cleanPriceRange = validateOptionalText(priceRangeSar, {
      label: 'النطاق السعري',
      maxLength: INPUT_LIMITS.breedFieldMax,
      defaultValue: '1,200 – 2,000 ر.س',
    });

    const newBreed = {
      id: `brd_${crypto.randomUUID().slice(0, 6)}`,
      categoryId: categoryId.trim(),
      name: cleanName,
      slug: `breed-${Date.now()}`,
      origin: cleanOrigin || 'المملكة العربية السعودية',
      summary: cleanSummary || 'سلالة مضافة عبر إدارة المنصة.',
      avgWeightKg: cleanAvgWeight || '35 – 55 كجم',
      priceRangeSar: cleanPriceRange || '1,200 – 2,000 ر.س',
      imageUrl: IMG.naimi,
      characteristics: ['سلالة معتمدة في المنصة'],
    };
    store.breeds.push(newBreed);
    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إضافة سلالة جديدة',
        targetType: 'breed',
        targetId: newBreed.id,
        note: newBreed.name,
      })
    );
    saveStore(store);
    res.status(201).json({ breed: newBreed });
  });

  // Smart Sub-Categories Admin Endpoints
  app.post('/api/v1/admin/categories', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const { name, parentId, description, keywords } = req.body || {};
    const cleanName = validateRequiredText(name, {
      label: 'اسم الفئة الفرعية',
      minLength: INPUT_LIMITS.categoryNameMin,
      maxLength: INPUT_LIMITS.categoryNameMax,
      code: 'invalid_category_name',
    });
    const validatedParentId = validateCategoryParentAssignment({
      categories: store.categories,
      requestedParentId: parentId,
      isCreate: true,
    });
    const cleanDescription = validateOptionalText(description, {
      label: 'وصف الفئة',
      maxLength: INPUT_LIMITS.categoryDescriptionMax,
      allowNewlines: true,
      defaultValue: '',
    });
    const parsedKeywords = parseAndValidateKeywords(keywords);

    const newCat = {
      id: `sub_${crypto.randomUUID().slice(0, 6)}`,
      name: cleanName,
      slug: `sub-${Date.now()}`,
      parentId: validatedParentId,
      description: cleanDescription,
      keywords: parsedKeywords,
    };

    store.categories.push(newCat);
    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'إنشاء فئة فرعية ذكية',
        targetType: 'category',
        targetId: newCat.id,
        note: newCat.name,
      })
    );
    saveStore(store);
    res.status(201).json({ category: newCat });
  });

  app.patch('/api/v1/admin/categories/:id', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const idx = store.categories.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الفئة غير موجودة' });

    const existing = store.categories[idx];
    const { name, parentId, description, keywords } = req.body || {};
    const cleanName =
      name !== undefined
        ? validateRequiredText(name, {
            label: 'اسم الفئة',
            minLength: INPUT_LIMITS.categoryNameMin,
            maxLength: INPUT_LIMITS.categoryNameMax,
            code: 'invalid_category_name',
          })
        : existing.name;

    let nextParentId = existing.parentId;
    if (parentId !== undefined) {
      nextParentId = validateCategoryParentAssignment({
        categories: store.categories,
        targetId: existing.id,
        existingParentId: existing.parentId,
        requestedParentId: parentId,
        isCreate: false,
      });
    }

    const cleanDescription =
      description !== undefined
        ? validateOptionalText(description, {
            label: 'وصف الفئة',
            maxLength: INPUT_LIMITS.categoryDescriptionMax,
            allowNewlines: true,
            defaultValue: '',
          })
        : existing.description;

    const parsedKeywords =
      keywords !== undefined ? parseAndValidateKeywords(keywords) : existing.keywords || [];

    const updated = {
      ...existing,
      name: cleanName,
      parentId: nextParentId,
      description: cleanDescription,
      keywords: parsedKeywords,
    };
    store.categories[idx] = updated;
    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'تعديل فئة فرعية',
        targetType: 'category',
        targetId: updated.id,
        note: updated.name,
      })
    );
    saveStore(store);
    res.json({ category: updated });
  });

  app.delete('/api/v1/admin/categories/:id', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const target = store.categories.find((c) => c.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'الفئة غير موجودة' });
    if (target.parentId === null) {
      return res.status(400).json({ error: 'لا يمكن حذف التصنيف الرئيسي' });
    }

    store.categories = store.categories.filter((c) => c.id !== req.params.id);
    store.listings = store.listings.map((l) =>
      l.subCategoryId === req.params.id
        ? { ...l, subCategoryId: inferSubCategoryId(l, store.categories) }
        : l
    );
    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'حذف فئة فرعية',
        targetType: 'category',
        targetId: target.id,
        note: target.name,
      })
    );
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/v1/admin/listings/auto-categorize', requireAdmin, (req, res) => {
    const currentUser = req.auth!.user;
    const { listingId, subCategoryId } = req.body || {};
    let updatedCount = 0;

    if (listingId) {
      const listing = store.listings.find((l) => l.id === listingId);
      if (!listing) return res.status(404).json({ error: 'الإعلان غير موجود' });
      const nextSubId =
        subCategoryId === undefined
          ? inferSubCategoryId(listing, store.categories)
          : subCategoryId || null;
      listing.subCategoryId = nextSubId;
      listing.updatedAt = new Date().toISOString();
      updatedCount = 1;
    } else {
      store.listings = store.listings.map((l) => {
        const nextSub = inferSubCategoryId(l, store.categories);
        if (nextSub && nextSub !== l.subCategoryId) {
          updatedCount += 1;
          return { ...l, subCategoryId: nextSub, updatedAt: new Date().toISOString() };
        }
        return l;
      });
    }

    store.auditLogs.unshift(
      createAuditLogEntry({
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'تشغيل التصنيف الذكي للإعلانات',
        targetType: 'listing',
        targetId: listingId || 'all',
        note: `تم تحديث تصنيف ${updatedCount} إعلان`,
      })
    );
    saveStore(store);
    res.json({ updatedCount });
  });

  app.get('/api/v1/admin/comments', requireAdmin, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const listingIdFilter =
      typeof req.query.listingId === 'string' ? req.query.listingId.trim() : '';

    const items = (store.comments || [])
      .map((comment) => {
        const listing = store.listings.find((l) => l.id === comment.listingId);
        if (!listing) return null;
        return {
          ...toPublicComment(comment, listing, store.users, store.sellers),
          listingTitle: listing.title,
          listingStatus: listing.status,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => {
        if (listingIdFilter && item.listingId !== listingIdFilter) return false;
        if (!q) return true;
        return (
          String(item.body || '').toLowerCase().includes(q) ||
          String(item.authorName || '').toLowerCase().includes(q) ||
          String(item.listingTitle || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paged = paginateAdminItems(items, req.query, { defaultLimit: 50, maxLimit: 100 });
    res.json({
      comments: paged.items,
      totalCount: paged.totalCount,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
      nextOffset: paged.nextOffset,
    });
  });

  // JSON error handler for the API (malformed JSON, oversized bodies, validation errors): no stack traces leak.
  app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof ValidationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof MediaUploadError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    const status = err?.type === 'entity.too.large' ? 413 : err?.status >= 400 && err?.status < 500 ? err.status : 500;
    if (status === 500) console.error('API error:', err);
    res.status(status).json({
      error: status === 413 ? 'حجم الطلب كبير جداً' : status === 500 ? 'حدث خطأ غير متوقع في الخادم' : 'طلب غير صالح',
    });
  });

  // Static / Vite setup
  if (opts.serveFrontend !== false) {
    if (config.isProd) {
      const distPath = path.resolve(__dirname, 'dist');
      app.use(
        express.static(distPath, {
          index: false,
          setHeaders(res, filePath) {
            if (filePath.endsWith('index.html')) {
              res.setHeader('Cache-Control', 'no-cache');
            } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  await new Promise<void>((resolve) => httpServer.listen(config.port, '0.0.0.0', () => resolve()));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`Souq Al-Ghanam server listening on http://localhost:${port}`);

  return {
    app,
    httpServer,
    port,
    config,
    getStore: () => store,
    cleanupOrphanedMedia: runOrphanedMediaCleanup,
    flushStore: () => {
      enforceRetention();
      return persister.flushSync(() => store);
    },
    close: async () => {
      clearInterval(sweeper);
      clearInterval(mediaSweeper);
      enforceRetention();
      persister.flushSync(() => store);
      realtime?.close();
      httpServer.closeAllConnections?.();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

// Start automatically only when executed directly (`tsx server.ts`), not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  // .env is read only here (never on import), and real environment variables always take precedence.
  loadEnvForEntryPoint();
  startServer()
    .then((srv) => {
      // Release the data-directory lock and close sockets cleanly on Ctrl+C / platform stop.
      let closing = false;
      const shutdown = (signal: string) => {
        if (closing) return;
        closing = true;
        console.log(`Received ${signal}, shutting down.`);
        srv.close().finally(() => process.exit(0));
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
