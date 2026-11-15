import { Heart, MapPin, Play, ShieldCheck, ThumbsUp, User as UserIcon } from 'lucide-react';
import type { Breed, Category, Listing, Region, SellerProfile } from '../types/marketplace';
import { formatPriceSar, formatRelativeArabicTime, formatStatusLabel } from '../lib/format';
import { SafeImage } from './SafeImage';
import { isSellerVerified, VerifiedSellerBadge } from './VerifiedSellerBadge';

interface ListingCardProps {
  listing: Listing;
  category?: Category;
  breed?: Breed;
  subCategory?: Category;
  region?: Region;
  seller?: SellerProfile;
  isFavorite: boolean;
  isLiked?: boolean;
  onSelect: (listing: Listing) => void;
  onSelectSeller?: (sellerId: string) => void;
  onToggleFavorite: (listingId: string) => void;
  onToggleLike?: (listingId: string) => void;
}

export function ListingCard({
  listing,
  category,
  breed,
  subCategory,
  region,
  seller,
  isFavorite,
  isLiked = false,
  onSelect,
  onSelectSeller,
  onToggleFavorite,
  onToggleLike,
}: ListingCardProps) {
  const coverImage = listing.images[0]?.url || breed?.imageUrl;
  const likesCount = listing.likesCount ?? 0;
  const canLike = listing.status === 'Published' && Boolean(onToggleLike);
  const totalHerdValue =
    listing.quantity > 1 ? listing.priceAmount * listing.quantity : null;
  const isSold = listing.status === 'Sold';

  const allowsOffers =
    listing.allowPriceOffers !== undefined ? listing.allowPriceOffers : listing.isNegotiable;

  const negotiationLabel = allowsOffers
    ? 'يقبل عروض السعر'
    : listing.isNegotiable
    ? 'قابل للتفاوض'
    : 'سعر نهائي';

  const locationText = [region?.name, listing.city].filter(Boolean).join(' — ');

  return (
    <article
      className={`group bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-green-ink)]/35 hover:shadow-md flex flex-col min-w-0 ${
        isSold ? 'opacity-90' : ''
      }`}
    >
      {/* Uniform 4:3 Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-cream)] border-b border-[var(--color-border)]/70">
        <button
          type="button"
          onClick={() => onSelect(listing)}
          className="w-full h-full block text-right cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-gold)]"
          aria-label={`عرض تفاصيل ${listing.title}`}
        >
          <SafeImage
            src={coverImage}
            alt={listing.title}
            width={800}
            height={597}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
              isSold ? 'grayscale-[30%]' : ''
            }`}
          />
        </button>

        {/* Top-Right Status / Video Indicators */}
        <div className="pointer-events-none absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {listing.video?.url && (
            <span className="px-2.5 py-1 rounded-md bg-[#0B3A29]/90 backdrop-blur-xs text-white text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm">
              <Play
                size={11}
                className="fill-[var(--color-gold)] text-[var(--color-gold)]"
                aria-hidden="true"
              />
              <span>فيديو</span>
            </span>
          )}
          {isSold && (
            <span className="px-2.5 py-1 rounded-md bg-[#14261D]/90 text-white text-[11px] font-bold shadow-sm">
              {formatStatusLabel(listing.status)}
            </span>
          )}
        </div>

        {/* Private Favorite Toggle (44x44 touch target, separate from public Likes) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
          }}
          aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          title={isFavorite ? 'إزالة من المفضلة' : 'حفظ في المفضلة'}
          aria-pressed={isFavorite}
          className={`absolute top-2.5 left-2.5 w-11 h-11 rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-xs focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] ${
            isFavorite
              ? 'bg-[var(--color-green)] text-[var(--color-gold)]'
              : 'bg-[var(--color-surface)]/92 text-[var(--color-ink)] hover:bg-[var(--color-surface)]'
          }`}
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>

        {/* Photo Count Hint when multiple photos exist */}
        {listing.images.length > 1 && (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold tabular-nums">
            {listing.images.length} صور
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3.5 min-w-0">
        <div className="min-w-0 space-y-2">
          {/* Unboxed Category / Breed / Specs Line */}
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-[var(--color-muted)]">
            {category && (
              <>
                <span className="font-medium text-[var(--color-ink)]">{category.name}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-bold text-[var(--color-green-ink)]">
              {breed?.name || 'أغنام'}
            </span>
            {subCategory && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--color-ink)] font-medium">{subCategory.name}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{listing.ageMonths} أشهر</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{listing.weightKg} كجم</span>
            {listing.vaccinated && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5 text-[var(--color-green-ink)] font-semibold">
                  <ShieldCheck size={12} aria-hidden="true" />
                  <span>محصّن</span>
                </span>
              </>
            )}
          </div>

          {/* Listing Title */}
          <h3 className="font-display text-base font-bold text-[var(--color-ink)] leading-snug line-clamp-2 min-h-[2.75rem]">
            <button
              type="button"
              onClick={() => onSelect(listing)}
              className="text-right hover:text-[var(--color-green-ink)] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] rounded-sm"
            >
              {listing.title}
            </button>
          </h3>

          {/* Seller Row */}
          {seller && (
            <div className="flex items-center flex-wrap gap-1.5 text-xs min-w-0">
              <UserIcon
                size={13}
                className="text-[var(--color-muted)] shrink-0"
                aria-hidden="true"
              />
              {onSelectSeller ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSeller(seller.userId);
                  }}
                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] hover:underline transition-colors cursor-pointer truncate max-w-[175px]"
                >
                  {seller.displayName}
                </button>
              ) : (
                <span className="font-semibold text-[var(--color-ink)] truncate max-w-[175px]">
                  {seller.displayName}
                </span>
              )}
              {isSellerVerified(seller) && <VerifiedSellerBadge variant="inline" />}
            </div>
          )}
        </div>

        {/* Pricing, Herd Value, Location & Engagement Footer */}
        <div className="pt-3 border-t border-[var(--color-border)]/80 space-y-2.5 min-w-0">
          {/* Unit Price vs Herd Value & Location */}
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <div className="min-w-0">
              <p className="font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums leading-tight">
                {formatPriceSar(listing.priceAmount)}
                <span className="text-[11px] font-semibold text-[var(--color-muted)] mr-1">
                  / للرأس
                </span>
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                {negotiationLabel}
                <span aria-hidden="true"> · </span>
                <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                  {listing.quantity} رأس
                </span>
              </p>
            </div>

            <div className="text-left text-xs text-[var(--color-muted)] shrink-0 max-w-[46%]">
              <p className="font-medium text-[var(--color-ink)] inline-flex items-center gap-1 justify-end max-w-full">
                <MapPin size={12} className="text-[var(--color-muted)] shrink-0" aria-hidden="true" />
                <span className="truncate">{locationText || listing.city}</span>
              </p>
              <p className="text-[11px] mt-0.5 tabular-nums">
                {formatRelativeArabicTime(listing.publishedAt)}
              </p>
            </div>
          </div>

          {/* Explicit Total Herd Value Row for multi-head listings */}
          {totalHerdValue !== null && (
            <div className="px-2.5 py-1.5 rounded-lg bg-[var(--color-cream)]/80 border border-[var(--color-border)]/70 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--color-muted)] font-medium">
                إجمالي قيمة القطيع ({listing.quantity} رأس)
              </span>
              <span className="font-display font-bold text-[var(--color-ink)] tabular-nums shrink-0">
                {formatPriceSar(totalHerdValue)}
              </span>
            </div>
          )}

          {/* Public Likes (separate from Favorites) & Details CTA */}
          <div className="pt-2 border-t border-[var(--color-border)]/60 flex items-center justify-between gap-2">
            {canLike ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLike?.(listing.id);
                }}
                aria-pressed={isLiked}
                aria-label={
                  isLiked
                    ? `إلغاء الإعجاب بالإعلان (${likesCount})`
                    : `الإعجاب بالإعلان (${likesCount})`
                }
                className={`min-h-[44px] px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-150 cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] ${
                  isLiked
                    ? 'bg-[var(--color-cream)] border-[var(--color-green-ink)] text-[var(--color-green-ink)]'
                    : 'bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream)]/60'
                }`}
              >
                <ThumbsUp
                  size={14}
                  aria-hidden="true"
                  className={isLiked ? 'fill-[var(--color-gold)] text-[var(--color-green-ink)]' : ''}
                />
                <span>{isLiked ? 'أعجبني' : 'إعجاب'}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums font-bold">{likesCount}</span>
              </button>
            ) : (
              <span className="min-h-[44px] inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] tabular-nums">
                <ThumbsUp size={13} aria-hidden="true" />
                <span>{likesCount} إعجاب</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => onSelect(listing)}
              className="min-h-[44px] px-3.5 rounded-lg text-xs font-semibold text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
            >
              التفاصيل والأسئلة
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
