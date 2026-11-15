import { ShieldCheck } from 'lucide-react';
import type { SellerProfile } from '../types/marketplace';

export function isSellerVerified(
  seller?: Pick<SellerProfile, 'verificationStatus' | 'verifiedAt'> | null
): boolean {
  if (!seller) return false;
  if (seller.verificationStatus) {
    return seller.verificationStatus === 'Verified';
  }
  return Boolean(seller.verifiedAt);
}

interface VerifiedSellerBadgeProps {
  variant?: 'inline' | 'badge' | 'compact';
  label?: string;
}

export function VerifiedSellerBadge({
  variant = 'badge',
  label = 'مربي موثق',
}: VerifiedSellerBadgeProps) {
  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-green-ink)]">
        <ShieldCheck size={13} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-green-ink)]"
        title="حساب مربي موثق من إدارة المنصة"
      >
        <ShieldCheck size={13} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-green-ink)] text-xs">
      <ShieldCheck size={15} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
