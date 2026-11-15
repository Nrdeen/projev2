import { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import type { Breed, Category, Region } from '../types/marketplace';
import { SafeImage } from './SafeImage';

export interface QuickFilterValues {
  q: string;
  categoryId: string;
  breedId: string;
  regionId: string;
  maxPrice: string;
}

interface HeroSearchProps {
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  onSearch: (filters: QuickFilterValues) => void;
  onBrowseAll: () => void;
  onAddListing?: () => void;
}

const HERO_MAX_PRICE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'بدون حد' },
  { value: '1500', label: 'حتى 1,500 ر.س' },
  { value: '3000', label: 'حتى 3,000 ر.س' },
  { value: '5000', label: 'حتى 5,000 ر.س' },
  { value: '10000', label: 'حتى 10,000 ر.س' },
  { value: '25000', label: 'حتى 25,000 ر.س' },
  { value: '50000', label: 'حتى 50,000 ر.س' },
  { value: '100000', label: 'حتى 100,000 ر.س' },
];

export function HeroSearch({
  categories,
  breeds,
  regions,
  onSearch,
  onBrowseAll,
  onAddListing,
}: HeroSearchProps) {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [breedId, setBreedId] = useState('all');
  const [regionId, setRegionId] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');

  const mainCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories]
  );

  const availableBreeds = useMemo(() => {
    if (categoryId === 'all') return breeds;
    return breeds.filter((b) => b.categoryId === categoryId);
  }, [breeds, categoryId]);

  const handleCategoryChange = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    if (nextCategoryId !== 'all' && breedId !== 'all') {
      const stillMatches = breeds.some(
        (b) => b.id === breedId && b.categoryId === nextCategoryId
      );
      if (!stillMatches) {
        setBreedId('all');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ q: q.trim(), categoryId, breedId, regionId, maxPrice });
  };

  const handleQuickBreed = (targetBreedId: string) => {
    onSearch({
      q: '',
      categoryId: 'all',
      breedId: targetBreedId,
      regionId: 'all',
      maxPrice: '',
    });
  };

  return (
    <section className="relative overflow-hidden bg-[#0B3A29]">
      {/* Background Pastoral Imagery with RTL-Measured Scrim */}
      <div className="absolute inset-0">
        <SafeImage
          src="/src/assets/images/hero_saudi_livestock_1794608168927.jpg"
          alt="قطيع من الأغنام النعيمية في مراعي المملكة العربية السعودية وقت الغروب"
          width={800}
          height={447}
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          className="w-full h-full object-cover object-center opacity-80"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-l from-[#0B3A29]/95 via-[#0B3A29]/78 to-[#14261D]/45 dark:from-[#081711]/95 dark:via-[#0B2319]/84 dark:to-[#0B1310]/55"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#0B3A29] via-transparent to-[#0B3A29]/30 dark:from-[#081711] dark:via-transparent dark:to-[#0B1310]/40"
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 sm:pt-14 sm:pb-12 lg:pt-20 lg:pb-14">
        {/* Editorial Hero Copy & Action Hierarchy */}
        <div className="max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold text-[#D79A3D] mb-3 tracking-wide">
            سوق المواشي السعودي المتخصص · البيع والتواصل بالريال السعودي
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.85rem] font-extrabold text-white leading-[1.22] text-balance">
            منصة المربين والمشترين الأولى للأنعام والسلالات الأصيلة
          </h1>
          <p className="mt-4 text-sm sm:text-base lg:text-lg text-[#FAF6EC]/90 leading-relaxed max-w-2xl">
            تصفّح إعلانات النعيمي والنجدي والحري والماعز العارضي بمواصفات دقيقة للعمر والوزن والتحصين، وتواصل مباشرة مع المربين الموثقين في مختلف مناطق المملكة.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBrowseAll}
              className="min-h-[44px] px-5 sm:px-6 py-2.5 rounded-lg bg-[#D79A3D] hover:bg-[#C4882D] text-[#14261D] text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span>تصفّح المواشي المتاحة</span>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>

            {onAddListing && (
              <button
                type="button"
                onClick={onAddListing}
                className="min-h-[44px] px-5 sm:px-6 py-2.5 rounded-lg border border-white/35 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold inline-flex items-center gap-2 backdrop-blur-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D79A3D]"
              >
                <Plus size={16} aria-hidden="true" />
                <span>أضف إعلانك الآن</span>
              </button>
            )}
          </div>
        </div>

        {/* Integrated Phase 3 Search Console */}
        <form
          onSubmit={handleSubmit}
          aria-label="البحث السريع في إعلانات المواشي"
          className="mt-8 lg:mt-10 bg-[var(--color-surface)] rounded-2xl p-4 sm:p-5 lg:p-6 shadow-xl border border-[var(--color-border)] transition-colors"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.65fr)_1fr_1fr_1fr_1fr_auto] gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-1">
              <label
                htmlFor="hero-search-q"
                className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5"
              >
                ابحث عن سلالة أو مدينة أو مواصفات
              </label>
              <div className="relative">
                <Search
                  size={17}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="hero-search-q"
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  maxLength={120}
                  placeholder="مثال: جذعان نعيمي، فحل، حفر الباطن..."
                  className="w-full h-11 pr-10 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="hero-cat"
                className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5"
              >
                التصنيف
              </label>
              <select
                id="hero-cat"
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
              >
                <option value="all">جميع التصنيفات</option>
                {mainCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="hero-breed"
                className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5"
              >
                السلالة
              </label>
              <select
                id="hero-breed"
                value={breedId}
                onChange={(e) => setBreedId(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
              >
                <option value="all">جميع السلالات</option>
                {availableBreeds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="hero-reg"
                className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5"
              >
                المنطقة
              </label>
              <select
                id="hero-reg"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
              >
                <option value="all">كل المناطق</option>
                {regions.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    {reg.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="hero-price"
                className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5"
              >
                السعر الأقصى (ر.س)
              </label>
              <select
                id="hero-price"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
              >
                {HERO_MAX_PRICE_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-1">
              <button
                type="submit"
                className="w-full lg:w-auto min-h-[44px] h-11 px-6 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
              >
                <Search size={16} aria-hidden="true" />
                <span>ابحث الآن</span>
              </button>
            </div>
          </div>

          {breeds.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-[var(--color-border)]/70 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[var(--color-muted)]">
                <span className="font-semibold text-[var(--color-ink)]">تصفح سريع بالسلالة:</span>
                {breeds.slice(0, 5).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleQuickBreed(b.id)}
                    className="min-h-[44px] sm:min-h-[32px] px-1.5 inline-flex items-center font-medium text-[var(--color-green-ink)] hover:text-[var(--color-gold)] hover:underline transition-colors cursor-pointer"
                  >
                    {b.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onBrowseAll}
                className="min-h-[44px] sm:min-h-[32px] px-1.5 inline-flex items-center font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer whitespace-nowrap"
              >
                عرض جميع الإعلانات المتاحة
              </button>
            </div>
          )}
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#FAF6EC]/85">
          <span>مواصفات واضحة للعمر والوزن والتحصين</span>
          <span aria-hidden="true">·</span>
          <span>أسعار استرشادية محدثة بالريال السعودي</span>
          <span aria-hidden="true">·</span>
          <span>تواصل ومفاوضة مباشرة عبر المنصة</span>
        </div>
      </div>
    </section>
  );
}
