import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  Flag,
  Layers,
  ShieldCheck,
  Star,
} from 'lucide-react';
import type {
  Article,
  Breed,
  Category,
  FAQ,
  Listing,
  SellerProfile,
} from '../types/marketplace';
import type { DirectoryFilters } from '../lib/listing-search';
import { Modal } from './Modal';
import { SafeImage } from './SafeImage';
import { VerifiedSellerBadge } from './VerifiedSellerBadge';

interface HomeCategoriesSectionProps {
  categories: Category[];
  publishedListings: Listing[];
  onFilterListings: (patch: Partial<DirectoryFilters>) => void;
  onBrowseAll: () => void;
}

export function HomeCategoriesSection({
  categories,
  publishedListings,
  onFilterListings,
  onBrowseAll,
}: HomeCategoriesSectionProps) {
  const mainCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories]
  );

  const subCategories = useMemo(
    () => categories.filter((c) => c.parentId !== null),
    [categories]
  );

  const countByMainCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of publishedListings) {
      counts.set(listing.categoryId, (counts.get(listing.categoryId) || 0) + 1);
    }
    return counts;
  }, [publishedListings]);

  const countBySubCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of publishedListings) {
      if (listing.subCategoryId) {
        counts.set(listing.subCategoryId, (counts.get(listing.subCategoryId) || 0) + 1);
      }
    }
    return counts;
  }, [publishedListings]);

  if (mainCategories.length === 0 && subCategories.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="home-categories-heading"
      className="bg-[var(--color-cream)]/60 border-b border-[var(--color-border)] py-10 lg:py-12 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2
              id="home-categories-heading"
              className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            >
              تصفح السوق حسب التصنيف والغرض
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              اختر نوع الأنعام أو الغرض من الشراء للانتقال مباشرة إلى الإعلانات المطابقة
            </p>
          </div>
          <button
            type="button"
            onClick={onBrowseAll}
            className="text-sm font-semibold text-[var(--color-green-ink)] hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>استعراض جميع التصنيفات</span>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
        </div>

        {/* Main Livestock Categories */}
        {mainCategories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {mainCategories.map((cat) => {
              const count = countByMainCategory.get(cat.id) || 0;
              const childNames = subCategories
                .filter((sub) => sub.parentId === cat.id)
                .map((sub) => sub.name);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onFilterListings({ categoryId: cat.id })}
                  className="group text-right bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] hover:border-[var(--color-green-ink)] p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-extrabold text-[var(--color-ink)] group-hover:text-[var(--color-green-ink)] transition-colors">
                        {cat.name}
                      </h3>
                      {cat.description ? (
                        <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed line-clamp-2">
                          {cat.description}
                        </p>
                      ) : childNames.length > 0 ? (
                        <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                          يشمل: {childNames.join(' · ')}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                          استعراض عروض {cat.name} المتاحة في جميع المناطق
                        </p>
                      )}
                    </div>
                    <span className="w-9 h-9 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-green-ink)] shrink-0">
                      <Layers size={17} aria-hidden="true" />
                    </span>
                  </div>

                  <div className="pt-3 border-t border-[var(--color-border)]/70 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--color-muted)] tabular-nums">
                      {count > 0 ? `${count} إعلان متاح` : 'تصفح القسم'}
                    </span>
                    <span className="font-semibold text-[var(--color-green-ink)] inline-flex items-center gap-1">
                      <span>عرض</span>
                      <ArrowLeft size={13} aria-hidden="true" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Sub-Categories (Purpose) */}
        {subCategories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {subCategories.map((sub) => {
              const parent = mainCategories.find((m) => m.id === sub.parentId);
              const count = countBySubCategory.get(sub.id) || 0;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() =>
                    onFilterListings({
                      categoryId: sub.parentId || 'all',
                      subCategoryId: sub.id,
                    })
                  }
                  className="text-right bg-[var(--color-surface)]/85 hover:bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] hover:border-[var(--color-gold)] px-4 py-3.5 transition-colors cursor-pointer flex items-center justify-between gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                      {parent && (
                        <>
                          <span>{parent.name}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="tabular-nums">
                        {count > 0 ? `${count} إعلان` : 'تصفية سريعة'}
                      </span>
                    </div>
                    <p className="font-display text-sm font-bold text-[var(--color-ink)] mt-0.5">
                      {sub.name}
                    </p>
                    {sub.description && (
                      <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-1">
                        {sub.description}
                      </p>
                    )}
                  </div>
                  <ArrowLeft
                    size={15}
                    className="text-[var(--color-green-ink)] shrink-0"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface HomeBreedsSectionProps {
  breeds: Breed[];
  onFilterByBreed: (breedId: string) => void;
  onOpenBreedsDirectory: () => void;
}

export function HomeBreedsSection({
  breeds,
  onFilterByBreed,
  onOpenBreedsDirectory,
}: HomeBreedsSectionProps) {
  return (
    <section
      aria-labelledby="home-breeds-heading"
      className="bg-[var(--color-cream)] border-y border-[var(--color-border)] py-14 lg:py-16 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2
              id="home-breeds-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              دليل السلالات والأسعار الاسترشادية
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              تعرّف على خصائص أشهر السلالات السعودية ومتوسطات أسعارها الاسترشادية في السوق
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenBreedsDirectory}
            className="text-sm font-semibold text-[var(--color-green-ink)] hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>استعراض الدليل والأسعار كاملة</span>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {breeds.slice(0, 5).map((breed) => (
            <article
              key={breed.id}
              className="group bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="aspect-[4/3] bg-[var(--color-cream)] overflow-hidden">
                <SafeImage
                  src={breed.imageUrl}
                  alt={breed.name}
                  width={800}
                  height={597}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    {breed.origin} · {breed.avgWeightKg}
                  </p>
                  <h3 className="font-display text-base font-extrabold text-[var(--color-ink)] mt-0.5">
                    {breed.name}
                  </h3>
                  <p className="mt-1.5 font-display text-sm font-extrabold text-[var(--color-green-ink)] tabular-nums">
                    {breed.priceRangeSar}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onFilterByBreed(breed.id)}
                  className="min-h-[44px] sm:min-h-[36px] pt-2.5 border-t border-[var(--color-border)]/70 text-xs font-semibold text-[var(--color-green-ink)] hover:underline text-right inline-flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span>تصفح عروض {breed.name}</span>
                  <ArrowLeft size={13} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

interface HomeBreedersSectionProps {
  verifiedSellers: SellerProfile[];
  otherSellers: SellerProfile[];
  onSelectSeller: (sellerId: string) => void;
  onOpenBreedersDirectory: () => void;
}

export function HomeBreedersSection({
  verifiedSellers,
  otherSellers,
  onSelectSeller,
  onOpenBreedersDirectory,
}: HomeBreedersSectionProps) {
  return (
    <section
      aria-labelledby="home-breeders-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16 space-y-12"
    >
      <div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2
              id="home-breeders-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              مربون موثقون في المملكة
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              أصحاب مزارع ومراحات معتمدة استكملت إجراءات التوثيق من إدارة المنصة
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenBreedersDirectory}
            className="text-sm font-semibold text-[var(--color-green-ink)] hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>المربون والمقالات والأسئلة الشائعة</span>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
        </div>

        {verifiedSellers.length === 0 ? (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 text-center">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              لا يوجد مربون موثقون معروضون حالياً.
            </p>
            <button
              type="button"
              onClick={onOpenBreedersDirectory}
              className="mt-3 text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
            >
              استعراض دليل المربين والأسعار
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {verifiedSellers.map((seller) => (
              <article
                key={seller.userId}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 flex flex-col justify-between gap-4 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
                    <span>{seller.city}</span>
                    <VerifiedSellerBadge variant="badge" />
                  </div>
                  <h3 className="mt-2.5 font-display text-lg font-bold text-[var(--color-ink)] leading-snug">
                    {seller.displayName}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-[var(--color-green-ink)]">
                    التخصص: {seller.specialty}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed line-clamp-2">
                    {seller.bio}
                  </p>
                </div>

                <div className="pt-3.5 border-t border-[var(--color-border)] flex items-center justify-between text-xs gap-2">
                  <span className="text-[var(--color-muted)] tabular-nums inline-flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 font-bold text-[var(--color-ink)]">
                      <Star
                        size={13}
                        className="text-[var(--color-gold)] fill-[var(--color-gold)]"
                        aria-hidden="true"
                      />
                      <span>{seller.rating.toFixed(1)}</span>
                      {seller.ratingCount !== undefined && (
                        <span className="font-normal text-[var(--color-muted)]">
                          ({seller.ratingCount})
                        </span>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      خبرة {seller.yearsExperience} سنة · {seller.totalSales} بيعة
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectSeller(seller.userId)}
                    className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--color-cream)] hover:bg-[var(--color-green)] hover:text-white text-[var(--color-green-ink)] font-semibold transition-colors shrink-0 cursor-pointer"
                  >
                    ملف المربي
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {otherSellers.length > 0 && (
        <div className="pt-8 border-t border-[var(--color-border)]">
          <div className="mb-6">
            <h3 className="font-display text-xl font-bold text-[var(--color-ink)]">
              مربون وبائعون آخرون في السوق
            </h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              حسابات مسجلة يمكنك تصفح مراحاتها وإعلاناتها، ولم تُستكمل إجراءات توثيقها المعتمدة بعد
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {otherSellers.map((seller) => (
              <article
                key={seller.userId}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                    <span>{seller.city}</span>
                    <span className="text-[11px] font-medium text-[var(--color-muted)]">
                      {seller.verificationStatus === 'Pending'
                        ? 'قيد مراجعة التوثيق'
                        : 'حساب غير موثق بعد'}
                    </span>
                  </div>
                  <h4 className="mt-2 font-display text-lg font-bold text-[var(--color-ink)]">
                    {seller.displayName}
                  </h4>
                  <p className="mt-1.5 text-sm text-[var(--color-muted)] line-clamp-2">
                    {seller.bio}
                  </p>
                </div>

                <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs gap-2">
                  <span className="text-[var(--color-muted)] tabular-nums inline-flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 font-bold text-[var(--color-ink)]">
                      <Star
                        size={13}
                        className="text-[var(--color-gold)] fill-[var(--color-gold)]"
                        aria-hidden="true"
                      />
                      <span>{seller.rating.toFixed(1)}</span>
                      {seller.ratingCount !== undefined && (
                        <span className="font-normal text-[var(--color-muted)]">
                          ({seller.ratingCount})
                        </span>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      خبرة {seller.yearsExperience} سنة · {seller.totalSales} بيعة
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectSeller(seller.userId)}
                    className="min-h-[44px] sm:min-h-[36px] px-2 font-semibold text-[var(--color-green-ink)] hover:underline shrink-0 cursor-pointer"
                  >
                    ملف المربي
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

interface HomeTrustSectionProps {
  onOpenBreedersDirectory: () => void;
  onAddListing: () => void;
}

export function HomeTrustSection({
  onOpenBreedersDirectory,
  onAddListing,
}: HomeTrustSectionProps) {
  const pillars = [
    {
      icon: ClipboardCheck,
      title: 'مراجعة الإعلانات واكتمال المواصفات',
      body: 'يمر كل إعلان جديد بمراجعة إدارية للتأكد من وضوح الصور ومطابقة البيانات الأساسية: السلالة، العمر بالأشهر، الوزن التقريبي، حالة التحصين، والسعر بالريال السعودي.',
    },
    {
      icon: ShieldCheck,
      title: 'توثيق حسابات المربين المعتمدين',
      body: 'يُمنح شعار «مربي موثق» فقط بعد تحقق إدارة المنصة من طلب التوثيق وبيانات المراح ورقم الجوال، مع فصل واضح بين الحسابات الموثقة والحسابات قيد المراجعة.',
    },
    {
      icon: Flag,
      title: 'تواصل مباشر ونظام إبلاغ فعّال',
      body: 'أجرِ محادثاتك وقدّم عروض السعر أو استفسر في التعليقات مباشرة مع المربي، مع إمكانية الإبلاغ الفوري عن أي إعلان أو تعليق مخالف لمراجعته.',
    },
  ];

  return (
    <section
      aria-labelledby="home-trust-heading"
      className="bg-[var(--color-cream)] border-y border-[var(--color-border)] py-14 lg:py-16 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-9">
          <div className="max-w-2xl">
            <h2
              id="home-trust-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            >
              معايير الأمان والموثوقية في سوق الغنم
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)] leading-relaxed">
              تعتمد المنصة إجراءات واضحة لتنظيم العرض والطلب بين المربين والمشترين داخل المملكة دون وسطاء عشوائيين
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenBreedersDirectory}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-xs font-semibold text-[var(--color-ink)] transition-colors cursor-pointer"
            >
              دليل المربين والأسئلة الشائعة
            </button>
            <button
              type="button"
              onClick={onAddListing}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              انشر إعلانك الآن
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-3"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-green-ink)]">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-bold text-[var(--color-ink)]">
                  {pillar.title}
                </h3>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">{pillar.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface HomeGuidesSectionProps {
  articles: Article[];
  faqs: FAQ[];
  onOpenBreedersDirectory: () => void;
}

export function HomeGuidesSection({
  articles,
  faqs,
  onOpenBreedersDirectory,
}: HomeGuidesSectionProps) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0]?.id || null);

  if (articles.length === 0 && faqs.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="home-guides-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16 space-y-12"
    >
      {articles.length > 0 && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2
                id="home-guides-heading"
                className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
              >
                أدلة المعرفة والإرشاد للمربين والمشترين
              </h2>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                مقالات عملية حول فحص الذبائح، برامج التحصين البيطري، ومقارنة السلالات المحلية
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenBreedersDirectory}
              className="text-sm font-semibold text-[var(--color-green-ink)] hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <span>عرض جميع الأدلة</span>
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {articles.slice(0, 3).map((article) => (
              <article
                key={article.id}
                className="group bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="aspect-[4/3] bg-[var(--color-cream)] overflow-hidden">
                  <SafeImage
                    src={article.imageUrl}
                    alt={article.title}
                    width={800}
                    height={597}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <div className="text-xs text-[var(--color-muted)] flex items-center gap-2">
                      <span className="font-semibold text-[var(--color-green-ink)]">
                        {article.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{article.readTimeMinutes} دقائق قراءة</span>
                    </div>
                    <h3 className="mt-1.5 font-display text-lg font-bold text-[var(--color-ink)] leading-snug">
                      {article.title}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed line-clamp-3">
                      {article.excerpt}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedArticle(article)}
                    className="min-h-[44px] sm:min-h-[36px] pt-3 border-t border-[var(--color-border)]/70 text-xs font-semibold text-[var(--color-green-ink)] hover:underline text-right inline-flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen size={14} aria-hidden="true" />
                      <span>قراءة المقال كاملاً</span>
                    </span>
                    <ArrowLeft size={13} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {faqs.length > 0 && (
        <div className="pt-10 border-t border-[var(--color-border)] grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-2.5">
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]">
              الأسئلة الشائعة حول السوق
            </h3>
            <p className="text-sm text-[var(--color-muted)] leading-relaxed">
              إجابات مباشرة حول مراجعة الإعلانات، الأسعار الاسترشادية، وآلية توثيق حسابات المربين والإبلاغ.
            </p>
            <button
              type="button"
              onClick={onOpenBreedersDirectory}
              className="pt-1 text-xs font-semibold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>الانتقال إلى صفحة المربين والأدلة</span>
              <ArrowLeft size={13} aria-hidden="true" />
            </button>
          </div>

          <div className="lg:col-span-8 divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] overflow-hidden">
            {faqs.slice(0, 4).map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div key={faq.id}>
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    className="w-full min-h-[52px] px-5 py-4 text-right flex items-center justify-between gap-4 hover:bg-[var(--color-cream)]/50 transition-colors cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <span className="font-display text-sm sm:text-base font-bold text-[var(--color-ink)]">
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={`shrink-0 text-[var(--color-muted)] transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-sm text-[var(--color-muted)] leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(selectedArticle)}
        onClose={() => setSelectedArticle(null)}
        title={selectedArticle?.title || ''}
        subtitle={
          selectedArticle
            ? `${selectedArticle.category} · ${selectedArticle.readTimeMinutes} دقائق قراءة`
            : undefined
        }
        size="xl"
      >
        {selectedArticle && (
          <div>
            <div className="aspect-[16/9] rounded-lg overflow-hidden bg-[var(--color-cream)]">
              <SafeImage
                src={selectedArticle.imageUrl}
                alt={selectedArticle.title}
                width={800}
                height={597}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="mt-5 text-base text-[var(--color-ink)] leading-loose whitespace-pre-line">
              {selectedArticle.content}
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}
