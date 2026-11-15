import type { Listing, SellerProfile } from '../types/marketplace';

/**
 * Resolves a requested listing strictly by ID without falling back to an unrelated listing.
 */
export function resolveRequestedListing(params: {
  listingId: string | null;
  allListings: Listing[];
  publishedListings: Listing[];
}): Listing | null {
  const id = params.listingId?.trim();
  if (!id) return null;
  return (
    params.allListings.find((item) => item.id === id) ||
    params.publishedListings.find((item) => item.id === id) ||
    null
  );
}

/**
 * Resolves a requested seller profile strictly by userId.
 */
export function resolveRequestedSeller(params: {
  sellerId: string | null;
  sellers: SellerProfile[];
}): SellerProfile | null {
  const id = params.sellerId?.trim();
  if (!id) return null;
  return params.sellers.find((seller) => seller.userId === id) || null;
}

/**
 * Partitions sellers so only strictly verified sellers appear under "Verified Breeders" headings,
 * while keeping non-verified sellers browsable in a separately labeled section.
 */
export function partitionSellersByVerification(sellers: SellerProfile[]): {
  verifiedSellers: SellerProfile[];
  otherSellers: SellerProfile[];
} {
  const verifiedSellers: SellerProfile[] = [];
  const otherSellers: SellerProfile[] = [];

  for (const seller of sellers) {
    if (seller.verificationStatus === 'Verified') {
      verifiedSellers.push(seller);
    } else {
      otherSellers.push(seller);
    }
  }

  return { verifiedSellers, otherSellers };
}

export interface SellerContactLinks {
  phoneDisplay: string | null;
  telHref: string | null;
  whatsappHref: string | null;
}

/**
 * Builds direct telephone and WhatsApp links strictly for signed-in non-owner viewers
 * when contact details are present according to backend privacy serialization.
 */
export function buildSellerContactLinks(params: {
  isSignedIn: boolean;
  isOwner: boolean;
  seller?: Pick<SellerProfile, 'phone' | 'whatsapp'> | null;
  listingTitle: string;
}): SellerContactLinks {
  if (!params.isSignedIn || params.isOwner || !params.seller) {
    return { phoneDisplay: null, telHref: null, whatsappHref: null };
  }

  const rawPhone = params.seller.phone?.trim() || '';
  const phoneDigits = rawPhone.replace(/[^\d+]/g, '');
  const telHref = phoneDigits ? `tel:${phoneDigits}` : null;

  const rawWhatsapp = params.seller.whatsapp?.trim() || rawPhone;
  let waDigits = rawWhatsapp.replace(/\D/g, '');
  if (waDigits.startsWith('00')) {
    waDigits = waDigits.slice(2);
  }
  if (/^05\d{8}$/.test(waDigits)) {
    waDigits = `966${waDigits.slice(1)}`;
  } else if (/^5\d{8}$/.test(waDigits)) {
    waDigits = `966${waDigits}`;
  }

  const messageText = `السلام عليكم، أستفسر عن إعلان: ${params.listingTitle}`;
  const whatsappHref =
    waDigits.length >= 9
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(messageText)}`
      : null;

  return {
    phoneDisplay: rawPhone || null,
    telHref,
    whatsappHref,
  };
}

export interface RoleAwareNavItem {
  key: string;
  page: 'home' | 'listings' | 'breeds' | 'breeders' | 'dashboard';
  dashboardTab?: 'my-listings' | 'favorites' | 'likes' | 'messages' | 'analytics' | 'admin';
  label: string;
}

export function getRoleAwareNavItems(
  role: 'buyer' | 'seller' | 'admin' | null
): RoleAwareNavItem[] {
  const base: RoleAwareNavItem[] = [
    { key: 'home', page: 'home', label: 'الرئيسية' },
    { key: 'listings', page: 'listings', label: 'الإعلانات' },
    { key: 'breeds', page: 'breeds', label: 'دليل السلالات' },
    { key: 'breeders', page: 'breeders', label: 'المربون والأسعار' },
  ];

  if (!role) {
    return base;
  }

  if (role === 'admin') {
    return [
      ...base,
      { key: 'dashboard', page: 'dashboard', dashboardTab: 'my-listings', label: 'حسابي' },
      { key: 'admin', page: 'dashboard', dashboardTab: 'admin', label: 'لوحة المشرف' },
    ];
  }

  return [...base, { key: 'dashboard', page: 'dashboard', label: 'حسابي' }];
}

export interface RoleAwareFooterLink {
  key: string;
  label: string;
  page: 'add' | 'login' | 'dashboard';
  authMode?: 'login' | 'register';
  dashboardTab?: 'my-listings' | 'favorites' | 'likes' | 'messages' | 'analytics' | 'admin';
}

export function getRoleAwareFooterAccountLinks(
  role: 'buyer' | 'seller' | 'admin' | null
): RoleAwareFooterLink[] {
  if (!role) {
    return [
      { key: 'login', label: 'تسجيل الدخول', page: 'login', authMode: 'login' },
      { key: 'register', label: 'إنشاء حساب جديد', page: 'login', authMode: 'register' },
    ];
  }

  if (role === 'admin') {
    return [
      {
        key: 'admin',
        label: 'لوحة الإشراف والمراجعة',
        page: 'dashboard',
        dashboardTab: 'admin',
      },
      {
        key: 'my-listings',
        label: 'إعلاناتي',
        page: 'dashboard',
        dashboardTab: 'my-listings',
      },
      {
        key: 'messages',
        label: 'المحادثات',
        page: 'dashboard',
        dashboardTab: 'messages',
      },
      {
        key: 'analytics',
        label: 'لوحة تحكم الأداء',
        page: 'dashboard',
        dashboardTab: 'analytics',
      },
    ];
  }

  if (role === 'seller') {
    return [
      {
        key: 'my-listings',
        label: 'إعلاناتي وتوثيق المراح',
        page: 'dashboard',
        dashboardTab: 'my-listings',
      },
      {
        key: 'messages',
        label: 'المحادثات وعروض السعر',
        page: 'dashboard',
        dashboardTab: 'messages',
      },
      {
        key: 'favorites',
        label: 'المفضلة',
        page: 'dashboard',
        dashboardTab: 'favorites',
      },
      {
        key: 'analytics',
        label: 'لوحة تحكم الأداء',
        page: 'dashboard',
        dashboardTab: 'analytics',
      },
    ];
  }

  return [
    {
      key: 'messages',
      label: 'المحادثات وعروض السعر',
      page: 'dashboard',
      dashboardTab: 'messages',
    },
    {
      key: 'favorites',
      label: 'المفضلة',
      page: 'dashboard',
      dashboardTab: 'favorites',
    },
    {
      key: 'likes',
      label: 'إعجاباتي',
      page: 'dashboard',
      dashboardTab: 'likes',
    },
  ];
}

