import crypto from 'node:crypto';

export function createUserRecord(input: { name: string; phone: string; role: 'buyer' | 'seller' | 'admin'; isDemo?: boolean }) {
  return {
    id: `usr_${crypto.randomUUID().slice(0, 8)}`,
    phone: input.phone,
    email: `${input.phone}@souqalghanam.sa`,
    name: input.name,
    role: input.role,
    status: 'active',
    phoneVerifiedAt: null as string | null,
    createdAt: new Date().toISOString(),
    ...(input.isDemo ? { isDemo: true } : {}),
  };
}

export function buildSellerProfile(user: { id: string; name: string; phone: string }, extra: { regionId?: string; city?: string } = {}) {
  const nowIso = new Date().toISOString();
  return {
    userId: user.id,
    displayName: `مراح ${user.name}`,
    bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
    regionId: extra.regionId || 'reg_riyadh',
    city: extra.city || 'الرياض',
    phone: user.phone,
    whatsapp: `966${user.phone.replace(/^0/, '')}`,
    verificationStatus: 'Pending' as const,
    verifiedAt: null as string | null,
    verificationNote: null as string | null,
    verificationRequestedAt: nowIso,
    verificationReviewedAt: null as string | null,
    yearsExperience: 3,
    specialty: 'أغنام وماعز',
    rating: 0,
    ratingCount: 0,
    totalSales: 0,
  };
}
