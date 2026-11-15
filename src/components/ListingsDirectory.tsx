import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Breed, Category, Listing, Region, SellerProfile } from '../types/marketplace';
import { api } from '../lib/api';
import {
  buildActiveFilterChips,
  countActiveDirectoryFilters,
  DEFAULT_DIRECTORY_FILTERS,
  DEFAULT_LISTINGS_PAGE_LIMIT,
  hasActiveDirectoryFilters,
  type DirectoryFilters,
  type ListingAvailabilityOption,
  type ListingSortOption,
} from '../lib/listing-search';
import { ListingCard } from './ListingCard';

export type { DirectoryFilters } from '../lib/listing-search';

interface ListingsDirectoryProps {
  listings: Listing[];
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  sellers: SellerProfile[];
  favoriteIds: string[];
  likedListingIds: string[];
  filters: DirectoryFilters;
  isSignedIn?: boolean;
  isAdmin?: boolean;
  refreshSignal?: number;
  onChangeFilters: (next: DirectoryFilters) => void;
  onResetFilters: () => void;
  onSelectListing: (listing: Listing) => void;
  onSelectSeller?: (sellerId: string) => void;
  onToggleFavorite: (listingId: string) => void;
  onToggleLike: (listingId: string) => void;
}

const COMMON_SAUDI_CITIES = [
  'الرياض',
  'جدة',
  'مكة المكرمة',
  'المدينة المنورة',
  'الدمام',
  'الخبر',
  'الأحساء',
  'بريدة',
  'عنيزة',
  'حفر الباطن',
  'الطائف',
  'حائل',
  'أبها',
  'تبوك',
  'الخرج',
  'المجمعة',
];

export function ListingsDirectory({
  listings: liveLikesPool,
  categories,
  breeds,
  regions,
  sellers,
  favoriteIds,
  likedListingIds,
  filters,
  isSignedIn = false,
  isAdmin = false,
  refreshSignal = 0,
  onChangeFilters,
  onResetFilters,
  onSelectListing,
  onSelectSeller,
  onToggleFavorite,
  onToggleLike,
}: ListingsDirectoryProps) {
  const [draftInputs, setDraftInputs] = useState({
    q: filters.q,
    city: filters.city,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    minQty: filters.minQty,
    maxQty: filters.maxQty,
  });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [items, setItems] = useState<Listing[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>('');
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const requestSeqRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Keep draft inputs synchronized when filters change externally (Back/Forward, chips, reset, hero)
  useEffect(() => {
    setDraftInputs({
      q: filters.q,
      city: filters.city,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      minQty: filters.minQty,
      maxQty: filters.maxQty,
    });
  }, [
    filters.q,
    filters.city,
    filters.minPrice,
    filters.maxPrice,
    filters.minQty,
    filters.maxQty,
  ]);

  const priceRangeInvalid = useMemo(() => {
    if (!draftInputs.minPrice.trim() || !draftInputs.maxPrice.trim()) return false;
    const min = Number(draftInputs.minPrice);
    const max = Number(draftInputs.maxPrice);
    return Number.isFinite(min) && Number.isFinite(max) && min > max;
  }, [draftInputs.minPrice, draftInputs.maxPrice]);

  const qtyRangeInvalid = useMemo(() => {
    if (!draftInputs.minQty.trim() || !draftInputs.maxQty.trim()) return false;
    const min = Number(draftInputs.minQty);
    const max = Number(draftInputs.maxQty);
    return Number.isFinite(min) && Number.isFinite(max) && min > max;
  }, [draftInputs.minQty, draftInputs.maxQty]);

  const commitDraftInputs = useCallback(
    (nextDraft: typeof draftInputs) => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const cleanMinP = nextDraft.minPrice.trim();
      const cleanMaxP = nextDraft.maxPrice.trim();
      const cleanMinQ = nextDraft.minQty.trim();
      const cleanMaxQ = nextDraft.maxQty.trim();

      const minPInvalid =
        cleanMinP !== '' && cleanMaxP !== '' && Number(cleanMinP) > Number(cleanMaxP);
      const minQInvalid =
        cleanMinQ !== '' && cleanMaxQ !== '' && Number(cleanMinQ) > Number(cleanMaxQ);

      if (minPInvalid || minQInvalid) {
        return;
      }

      const current = filtersRef.current;
      const merged: DirectoryFilters = {
        ...current,
        q: nextDraft.q.trim(),
        city: nextDraft.city.trim(),
        minPrice: cleanMinP,
        maxPrice: cleanMaxP,
        minQty: cleanMinQ,
        maxQty: cleanMaxQ,
      };

      if (
        merged.q === current.q &&
        merged.city === current.city &&
        merged.minPrice === current.minPrice &&
        merged.maxPrice === current.maxPrice &&
        merged.minQty === current.minQty &&
        merged.maxQty === current.maxQty
      ) {
        return;
      }

      onChangeFilters(merged);
    },
    [onChangeFilters]
  );

  const scheduleDraftChange = useCallback(
    (patch: Partial<typeof draftInputs>) => {
      setDraftInputs((prev) => {
        const nextDraft = { ...prev, ...patch };
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = window.setTimeout(() => {
          commitDraftInputs(nextDraft);
        }, 280);
        return nextDraft;
      });
    },
    [commitDraftInputs]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const buildApiParams = useCallback((activeFilters: DirectoryFilters, offset: number) => {
    return {
      q: activeFilters.q.trim() || undefined,
      categoryId: activeFilters.categoryId !== 'all' ? activeFilters.categoryId : undefined,
      subCategoryId:
        activeFilters.subCategoryId !== 'all' ? activeFilters.subCategoryId : undefined,
      breedId: activeFilters.breedId !== 'all' ? activeFilters.breedId : undefined,
      regionId: activeFilters.regionId !== 'all' ? activeFilters.regionId : undefined,
      city: activeFilters.city.trim() || undefined,
      minPrice: activeFilters.minPrice.trim() || undefined,
      maxPrice: activeFilters.maxPrice.trim() || undefined,
      minQty: activeFilters.minQty.trim() || undefined,
      maxQty: activeFilters.maxQty.trim() || undefined,
      sex: activeFilters.sex !== 'all' ? activeFilters.sex : undefined,
      verifiedOnly: activeFilters.verifiedOnly ? 'true' : undefined,
      vaccinatedOnly: activeFilters.vaccinatedOnly ? 'true' : undefined,
      hasVideo: activeFilters.hasVideoOnly ? 'true' : undefined,
      negotiable: activeFilters.negotiableOnly ? 'true' : undefined,
      acceptsOffers: activeFilters.acceptsOffersOnly ? 'true' : undefined,
      availability:
        activeFilters.availability !== 'all' ? activeFilters.availability : undefined,
      sort: activeFilters.sort,
      limit: DEFAULT_LISTINGS_PAGE_LIMIT,
      offset,
    };
  }, []);

  // Fetch initial page whenever filters or refresh triggers change
  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const controller = new AbortController();
    setLoading(true);
    setFetchError('');

    api
      .getListings(buildApiParams(filters, 0), { signal: controller.signal })
      .then((res) => {
        if (seq !== requestSeqRef.current) return;
        setItems(res.listings);
        setTotalCount(typeof res.totalCount === 'number' ? res.totalCount : res.listings.length);
        setHasMore(Boolean(res.hasMore));
        setNextOffset(res.nextOffset ?? null);
      })
      .catch((err: unknown) => {
        if (seq !== requestSeqRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFetchError(
          err instanceof Error && err.message
            ? err.message
            : 'تعذر تحميل نتائج الإعلانات، حاول مرة أخرى'
        );
      })
      .finally(() => {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [buildApiParams, filters, refreshSignal, reloadNonce]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || nextOffset === null) return;
    const seq = requestSeqRef.current;
    setLoadingMore(true);
    setFetchError('');
    try {
      const res = await api.getListings(buildApiParams(filters, nextOffset));
      if (seq !== requestSeqRef.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const additions = res.listings.filter((item) => !seen.has(item.id));
        return [...prev, ...additions];
      });
      setTotalCount(typeof res.totalCount === 'number' ? res.totalCount : totalCount);
      setHasMore(Boolean(res.hasMore));
      setNextOffset(res.nextOffset ?? null);
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return;
      setFetchError(
        err instanceof Error && err.message
          ? err.message
          : 'تعذر تحميل المزيد من الإعلانات'
      );
    } finally {
      if (seq === requestSeqRef.current) {
        setLoadingMore(false);
      }
    }
  };

  // Overlay live likes count updates from App state (WebSocket / user click) without re-fetching
  const displayedItems = useMemo(() => {
    if (!liveLikesPool.length) return items;
    const liveById = new Map(liveLikesPool.map((l) => [l.id, l]));
    return items.map((item) => {
      const live = liveById.get(item.id);
      return live && live.likesCount !== item.likesCount
        ? { ...item, likesCount: live.likesCount }
        : item;
    });
  }, [items, liveLikesPool]);

  const mainCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories]
  );

  const availableSubCategories = useMemo(() => {
    const subs = categories.filter((c) => c.parentId !== null);
    if (filters.categoryId === 'all') return subs;
    return subs.filter((c) => c.parentId === filters.categoryId);
  }, [categories, filters.categoryId]);

  const availableBreeds = useMemo(() => {
    if (filters.categoryId === 'all') return breeds;
    return breeds.filter((b) => b.categoryId === filters.categoryId);
  }, [breeds, filters.categoryId]);

  const citySuggestions = useMemo(() => {
    const set = new Set<string>(COMMON_SAUDI_CITIES);
    liveLikesPool.forEach((l) => {
      if (l.city?.trim()) set.add(l.city.trim());
    });
    return Array.from(set);
  }, [liveLikesPool]);

  const activeChips = useMemo(
    () => buildActiveFilterChips(filters, { breeds, categories, regions }),
    [filters, breeds, categories, regions]
  );

  const activeFilterCount = useMemo(
    () => countActiveDirectoryFilters(filters),
    [filters]
  );

  const anyFilterOrSortActive = useMemo(
    () => hasActiveDirectoryFilters(filters),
    [filters]
  );

  const handleCategoryChange = (nextCategoryId: string) => {
    const subStillValid =
      filters.subCategoryId === 'all' ||
      nextCategoryId === 'all' ||
      categories.some(
        (c) => c.id === filters.subCategoryId && c.parentId === nextCategoryId
      );

    const breedStillValid =
      filters.breedId === 'all' ||
      nextCategoryId === 'all' ||
      breeds.some((b) => b.id === filters.breedId && b.categoryId === nextCategoryId);

    onChangeFilters({
      ...filters,
      categoryId: nextCategoryId,
      subCategoryId: subStillValid ? filters.subCategoryId : 'all',
      breedId: breedStillValid ? filters.breedId : 'all',
    });
  };

  const handleSubCategorySelect = (nextSubId: string) => {
    if (nextSubId === 'all') {
      onChangeFilters({ ...filters, subCategoryId: 'all' });
      return;
    }
    const sub = categories.find((c) => c.id === nextSubId);
    const parentCatId = sub?.parentId || filters.categoryId;
    const breedStillValid =
      filters.breedId === 'all' ||
      parentCatId === 'all' ||
      breeds.some((b) => b.id === filters.breedId && b.categoryId === parentCatId);

    onChangeFilters({
      ...filters,
      categoryId: parentCatId,
      subCategoryId: nextSubId,
      breedId: breedStillValid ? filters.breedId : 'all',
    });
  };

  const handleRemoveChip = (patch: Partial<DirectoryFilters>) => {
    const next = { ...filters, ...patch };
    setDraftInputs({
      q: next.q,
      city: next.city,
      minPrice: next.minPrice,
      maxPrice: next.maxPrice,
      minQty: next.minQty,
      maxQty: next.maxQty,
    });
    onChangeFilters(next);
  };

  const handleClearAll = () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setDraftInputs({
      q: DEFAULT_DIRECTORY_FILTERS.q,
      city: DEFAULT_DIRECTORY_FILTERS.city,
      minPrice: DEFAULT_DIRECTORY_FILTERS.minPrice,
      maxPrice: DEFAULT_DIRECTORY_FILTERS.maxPrice,
      minQty: DEFAULT_DIRECTORY_FILTERS.minQty,
      maxQty: DEFAULT_DIRECTORY_FILTERS.maxQty,
    });
    onResetFilters();
  };

  const remainingCount = Math.max(0, totalCount - displayedItems.length);
  const progressPercent =
    totalCount > 0 ? Math.min(100, Math.round((displayedItems.length / totalCount) * 100)) : 0;

  return (
    <section
      aria-labelledby="directory-page-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-9 overflow-x-clip"
    >
      {/* Top Marketplace Header Band */}
      <div className="bg-[var(--color-cream)]/70 border border-[var(--color-border)] rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--color-green-ink)] mb-1">
              سوق المواشي الموثوق في المملكة
            </p>
            <h1
              id="directory-page-heading"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)] text-balance"
            >
              دليل إعلانات المواشي
            </h1>
            <p
              className="mt-1.5 text-sm text-[var(--color-muted)] leading-relaxed"
              role="status"
              aria-live="polite"
            >
              {loading ? (
                'جاري البحث وتحديث النتائج...'
              ) : filters.q.trim() ? (
                <>
                  نتائج البحث عن{' '}
                  <span className="font-semibold text-[var(--color-ink)]">
                    «{filters.q.trim()}»
                  </span>
                  :{' '}
                  <span className="font-bold text-[var(--color-green-ink)] tabular-nums">
                    {totalCount}
                  </span>{' '}
                  إعلان مطابق
                  {displayedItems.length > 0 && totalCount > displayedItems.length
                    ? ` (عرض ${displayedItems.length})`
                    : ''}
                </>
              ) : (
                <>
                  تصفّح حسب السلالة والمنطقة والنطاق السعري والمواصفات المنظمة —{' '}
                  <span className="font-bold text-[var(--color-green-ink)] tabular-nums">
                    {totalCount}
                  </span>{' '}
                  إعلان مطابق
                  {displayedItems.length > 0 && totalCount > displayedItems.length
                    ? ` · عرض ${displayedItems.length}`
                    : ''}
                </>
              )}
            </p>
          </div>

          {/* Sort & Quick Clear */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label
              htmlFor="dir-sort"
              className="text-xs font-semibold text-[var(--color-muted)] whitespace-nowrap"
            >
              ترتيب حسب:
            </label>
            <select
              id="dir-sort"
              value={filters.sort}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  sort: e.target.value as ListingSortOption,
                })
              }
              className="h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)] cursor-pointer"
            >
              <option value="newest">الأحدث نشراً</option>
              <option value="oldest">الأقدم نشراً</option>
              <option value="most_liked">الأكثر إعجاباً</option>
              <option value="price_asc">السعر: من الأقل إلى الأعلى</option>
              <option value="price_desc">السعر: من الأعلى إلى الأقل</option>
            </select>
          </div>
        </div>

        {/* Keyword Search Bar + Mobile Filter Trigger */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-2 border-t border-[var(--color-border)]/80">
          <div className="relative flex-1 min-w-0">
            <label htmlFor="flt-q" className="sr-only">
              البحث بالكلمات المفتاحية (السلالة، الوصف، المدينة، المربي)
            </label>
            <Search
              size={17}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="flt-q"
              type="text"
              maxLength={120}
              value={draftInputs.q}
              onChange={(e) => scheduleDraftChange({ q: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDraftInputs(draftInputs);
                }
              }}
              placeholder="ابحث بالسلالة، الوصف، المدينة أو اسم المربي (مثال: جذعان نعيمي، عارضي، حفر الباطن)..."
              className="w-full h-11 pr-10 pl-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]"
            />
            {draftInputs.q && (
              <button
                type="button"
                onClick={() => {
                  const nextDraft = { ...draftInputs, q: '' };
                  setDraftInputs(nextDraft);
                  commitDraftInputs(nextDraft);
                }}
                aria-label="مسح نص البحث"
                className="absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
              aria-expanded={mobileFiltersOpen}
              aria-controls="directory-advanced-filters"
              className={`lg:hidden flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mobileFiltersOpen || activeFilterCount > 0
                  ? 'border-[var(--color-green-ink)] bg-[var(--color-surface)] text-[var(--color-green-ink)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]'
              }`}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>
                الفلاتر المتقدمة
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </span>
              {mobileFiltersOpen ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>

            {anyFilterOrSortActive && (
              <button
                type="button"
                onClick={handleClearAll}
                className="min-h-[44px] px-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-green-ink)] cursor-pointer whitespace-nowrap"
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>مسح جميع الفلاتر</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Category Quick Purpose Strip */}
        {availableSubCategories.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 pt-1"
            role="group"
            aria-label="التصنيفات الفرعية"
          >
            <span className="text-xs font-semibold text-[var(--color-muted)] ml-1">الغرض:</span>
            <button
              type="button"
              onClick={() => handleSubCategorySelect('all')}
              aria-pressed={filters.subCategoryId === 'all'}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filters.subCategoryId === 'all'
                  ? 'bg-[var(--color-green)] text-white shadow-xs'
                  : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:text-[var(--color-ink)] hover:border-[var(--color-green-ink)]/40'
              }`}
            >
              جميع الفئات الفرعية
            </button>
            {availableSubCategories.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleSubCategorySelect(sub.id)}
                aria-pressed={filters.subCategoryId === sub.id}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filters.subCategoryId === sub.id
                    ? 'bg-[var(--color-green)] text-white shadow-xs'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:text-[var(--color-ink)] hover:border-[var(--color-green-ink)]/40'
                }`}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Two-Column Directory Layout: Desktop Sticky Sidebar + Paginated Results */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-7 items-start">
        {/* Desktop Sticky Sidebar / Mobile Collapsible Filter Panel */}
        <aside
          aria-label="خيارات تصفية الإعلانات"
          className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20 min-w-0"
        >
          <div
            id="directory-advanced-filters"
            className={`${
              mobileFiltersOpen ? 'block' : 'hidden'
            } lg:block bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-xs`}
          >
            {/* Sidebar Header */}
            <div className="px-4 py-3.5 bg-[var(--color-cream)]/75 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Filter size={15} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
                <h2 className="font-display text-sm font-bold text-[var(--color-ink)] truncate">
                  تصفية النتائج
                </h2>
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--color-green)] text-white text-[11px] font-bold tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </div>

              {anyFilterOrSortActive && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>إعادة ضبط</span>
                </button>
              )}
            </div>

            <div className="divide-y divide-[var(--color-border)]">
              {/* Group 1: Category & Breed */}
              <div className="p-4 space-y-3">
                <h3 className="text-xs font-bold text-[var(--color-ink)]">التصنيف والسلالة</h3>

                <div>
                  <label htmlFor="flt-cat" className="block text-xs text-[var(--color-muted)] mb-1">
                    التصنيف الرئيسي
                  </label>
                  <select
                    id="flt-cat"
                    value={filters.categoryId}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    <option value="all">جميع التصنيفات</option>
                    {mainCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="flt-subcat" className="block text-xs text-[var(--color-muted)] mb-1">
                    الفئة الفرعية
                  </label>
                  <select
                    id="flt-subcat"
                    value={filters.subCategoryId}
                    onChange={(e) => handleSubCategorySelect(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    <option value="all">جميع الفئات الفرعية</option>
                    {availableSubCategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="flt-breed" className="block text-xs text-[var(--color-muted)] mb-1">
                    السلالة
                  </label>
                  <select
                    id="flt-breed"
                    value={filters.breedId}
                    onChange={(e) => onChangeFilters({ ...filters, breedId: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    <option value="all">جميع السلالات</option>
                    {availableBreeds.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Group 2: Location */}
              <div className="p-4 space-y-3">
                <h3 className="text-xs font-bold text-[var(--color-ink)]">الموقع الجغرافي</h3>

                <div>
                  <label htmlFor="flt-region" className="block text-xs text-[var(--color-muted)] mb-1">
                    المنطقة السعودية
                  </label>
                  <select
                    id="flt-region"
                    value={filters.regionId}
                    onChange={(e) => onChangeFilters({ ...filters, regionId: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    <option value="all">جميع المناطق</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="flt-city" className="block text-xs text-[var(--color-muted)] mb-1">
                    المدينة / المحافظة
                  </label>
                  <input
                    id="flt-city"
                    type="text"
                    list="saudi-cities-suggestions"
                    maxLength={60}
                    value={draftInputs.city}
                    onChange={(e) => scheduleDraftChange({ city: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitDraftInputs(draftInputs);
                      }
                    }}
                    placeholder="مثال: بريدة، الطائف، الرياض"
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]"
                  />
                  <datalist id="saudi-cities-suggestions">
                    {citySuggestions.map((city) => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Group 3: Price & Quantity Ranges */}
              <div className="p-4 space-y-3.5">
                <h3 className="text-xs font-bold text-[var(--color-ink)]">السعر والكمية</h3>

                <div>
                  <span className="block text-xs text-[var(--color-muted)] mb-1">
                    السعر للرأس (ر.س)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="flt-minp" className="sr-only">
                        الحد الأدنى للسعر
                      </label>
                      <input
                        id="flt-minp"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={draftInputs.minPrice}
                        onChange={(e) => scheduleDraftChange({ minPrice: e.target.value })}
                        placeholder="من"
                        aria-invalid={priceRangeInvalid}
                        className="w-full h-11 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="flt-maxp" className="sr-only">
                        الحد الأقصى للسعر
                      </label>
                      <input
                        id="flt-maxp"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={draftInputs.maxPrice}
                        onChange={(e) => scheduleDraftChange({ maxPrice: e.target.value })}
                        placeholder="إلى"
                        aria-invalid={priceRangeInvalid}
                        className="w-full h-11 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                  </div>
                  {priceRangeInvalid && (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                      الحد الأدنى للسعر أكبر من الحد الأقصى
                    </p>
                  )}
                </div>

                <div>
                  <span className="block text-xs text-[var(--color-muted)] mb-1">
                    عدد الرؤوس (الكمية في الإعلان)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="flt-minq" className="sr-only">
                        الحد الأدنى للكمية
                      </label>
                      <input
                        id="flt-minq"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={draftInputs.minQty}
                        onChange={(e) => scheduleDraftChange({ minQty: e.target.value })}
                        placeholder="من (رأس)"
                        aria-invalid={qtyRangeInvalid}
                        className="w-full h-11 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="flt-maxq" className="sr-only">
                        الحد الأقصى للكمية
                      </label>
                      <input
                        id="flt-maxq"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={draftInputs.maxQty}
                        onChange={(e) => scheduleDraftChange({ maxQty: e.target.value })}
                        placeholder="إلى (رأس)"
                        aria-invalid={qtyRangeInvalid}
                        className="w-full h-11 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                  </div>
                  {qtyRangeInvalid && (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                      الحد الأدنى للكمية أكبر من الحد الأقصى
                    </p>
                  )}
                </div>
              </div>

              {/* Group 4: Livestock Attributes & Sale Mode */}
              <div className="p-4 space-y-3">
                <h3 className="text-xs font-bold text-[var(--color-ink)]">
                  المواصفات وطريقة البيع
                </h3>

                <div>
                  <label htmlFor="flt-sex" className="block text-xs text-[var(--color-muted)] mb-1">
                    الجنس / نوع العرض
                  </label>
                  <select
                    id="flt-sex"
                    value={filters.sex}
                    onChange={(e) => onChangeFilters({ ...filters, sex: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    <option value="all">الكل</option>
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                    <option value="قطيع مختلط">قطيع مختلط</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="flt-availability"
                    className="block text-xs text-[var(--color-muted)] mb-1"
                  >
                    توفر الإعلان وطريقة البيع
                  </label>
                  <select
                    id="flt-availability"
                    value={filters.availability}
                    onChange={(e) =>
                      onChangeFilters({
                        ...filters,
                        availability: e.target.value as ListingAvailabilityOption,
                      })
                    }
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                  >
                    <option value="all">الإعلانات المنشورة المتاحة</option>
                    <option value="available">متوفر بالكمية (رأس فأكثر)</option>
                    <option value="accepts_offers">يقبل عروض السعر (السوم)</option>
                    <option value="negotiable">سعر قابل للتفاوض</option>
                    {isSignedIn && (
                      <option value="sold">
                        {isAdmin ? 'الإعلانات المباعة (الإدارة)' : 'إعلاناتي المباعة'}
                      </option>
                    )}
                  </select>
                </div>
              </div>

              {/* Group 5: Specialized Checkboxes */}
              <div className="p-4 space-y-1">
                <h3 className="text-xs font-bold text-[var(--color-ink)] mb-1.5">
                  مزايا وتوثيق الإعلان
                </h3>

                <label className="min-h-[44px] px-2 -mx-2 rounded-lg hover:bg-[var(--color-cream)]/60 flex items-center gap-2.5 text-sm text-[var(--color-ink)] cursor-pointer select-none transition-colors">
                  <input
                    type="checkbox"
                    checked={filters.verifiedOnly}
                    onChange={(e) =>
                      onChangeFilters({ ...filters, verifiedOnly: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#0B3A29] shrink-0"
                  />
                  <span>مربون موثقون فقط</span>
                </label>

                <label className="min-h-[44px] px-2 -mx-2 rounded-lg hover:bg-[var(--color-cream)]/60 flex items-center gap-2.5 text-sm text-[var(--color-ink)] cursor-pointer select-none transition-colors">
                  <input
                    type="checkbox"
                    checked={filters.vaccinatedOnly}
                    onChange={(e) =>
                      onChangeFilters({ ...filters, vaccinatedOnly: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#0B3A29] shrink-0"
                  />
                  <span>محصّن بيطرياً فقط</span>
                </label>

                <label className="min-h-[44px] px-2 -mx-2 rounded-lg hover:bg-[var(--color-cream)]/60 flex items-center gap-2.5 text-sm text-[var(--color-ink)] cursor-pointer select-none transition-colors">
                  <input
                    type="checkbox"
                    checked={filters.hasVideoOnly}
                    onChange={(e) =>
                      onChangeFilters({ ...filters, hasVideoOnly: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#0B3A29] shrink-0"
                  />
                  <span>يحتوي على فيديو فقط</span>
                </label>

                <label className="min-h-[44px] px-2 -mx-2 rounded-lg hover:bg-[var(--color-cream)]/60 flex items-center gap-2.5 text-sm text-[var(--color-ink)] cursor-pointer select-none transition-colors">
                  <input
                    type="checkbox"
                    checked={filters.negotiableOnly}
                    onChange={(e) =>
                      onChangeFilters({ ...filters, negotiableOnly: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#0B3A29] shrink-0"
                  />
                  <span>قابل للتفاوض فقط</span>
                </label>

                <label className="min-h-[44px] px-2 -mx-2 rounded-lg hover:bg-[var(--color-cream)]/60 flex items-center gap-2.5 text-sm text-[var(--color-ink)] cursor-pointer select-none transition-colors">
                  <input
                    type="checkbox"
                    checked={filters.acceptsOffersOnly}
                    onChange={(e) =>
                      onChangeFilters({ ...filters, acceptsOffersOnly: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#0B3A29] shrink-0"
                  />
                  <span>يقبل عروض السعر</span>
                </label>
              </div>
            </div>

            {/* Mobile Drawer Footer Apply/Close */}
            <div className="lg:hidden px-4 py-3 bg-[var(--color-cream)]/75 border-t border-[var(--color-border)] flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="flex-1 min-h-[44px] px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer tabular-nums"
              >
                عرض النتائج ({totalCount})
              </button>
              {anyFilterOrSortActive && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="min-h-[44px] px-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-ink)] cursor-pointer"
                >
                  مسح
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Results Column */}
        <div className="lg:col-span-8 xl:col-span-9 min-w-0 space-y-5">
          {/* Removable Active Filter Chips */}
          {activeChips.length > 0 && (
            <div
              className="p-3.5 rounded-xl bg-[var(--color-cream)]/60 border border-[var(--color-border)] flex flex-wrap items-center gap-2"
              aria-label="الفلاتر النشطة"
            >
              <span className="text-xs font-semibold text-[var(--color-muted)] ml-1">
                الفلاتر النشطة:
              </span>
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => handleRemoveChip(chip.clearPatch)}
                  aria-label={`إزالة فلتر ${chip.label}`}
                  className="min-h-[44px] sm:min-h-[36px] px-3 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-green-ink)] text-xs font-semibold text-[var(--color-ink)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{chip.label}</span>
                  <X size={13} className="text-[var(--color-muted)]" aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                onClick={handleClearAll}
                className="min-h-[44px] sm:min-h-[36px] px-2.5 text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
              >
                مسح الكل
              </button>
            </div>
          )}

          {/* Error State */}
          {fetchError && (
            <div
              role="alert"
              className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <p className="text-sm font-medium text-red-800 dark:text-red-300">{fetchError}</p>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="min-h-[44px] px-4 rounded-lg bg-[var(--color-green)] text-white text-xs font-semibold hover:bg-[var(--color-green-hover)] shrink-0 cursor-pointer"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {/* Loading Skeleton (Initial Page Load) */}
          {loading && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
              aria-busy="true"
              aria-label="جاري تحميل الإعلانات"
            >
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] bg-[var(--color-cream)]" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 w-2/3 bg-[var(--color-cream)] rounded" />
                    <div className="h-5 w-5/6 bg-[var(--color-cream)] rounded" />
                    <div className="h-3.5 w-1/2 bg-[var(--color-cream)] rounded" />
                    <div className="pt-2 border-t border-[var(--color-border)]/60 flex items-center justify-between">
                      <div className="h-5 w-24 bg-[var(--color-cream)] rounded" />
                      <div className="h-4 w-16 bg-[var(--color-cream)] rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty Results State */}
          {!loading && !fetchError && displayedItems.length === 0 && (
            <div className="text-center py-14 px-6 bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center mx-auto mb-4">
                <SearchX size={22} aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                لا توجد إعلانات مطابقة للخيارات المحددة
              </h2>
              <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed max-w-lg mx-auto">
                {filters.q.trim()
                  ? `لم يتم العثور على نتائج تطابق «${filters.q.trim()}» مع الفلاتر الحالية. جرّب تقصير عبارة البحث أو إزالة بعض الشروط.`
                  : 'جرّب توسيع النطاق السعري أو الكمية، أو تغيير المنطقة والسلالة لعرض المزيد من العروض المتاحة.'}
              </p>
              {anyFilterOrSortActive && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] text-white text-sm font-semibold hover:bg-[var(--color-green-hover)] inline-flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    <span>مسح جميع الفلاتر وعرض الإعلانات</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Paginated Results Grid */}
          {!loading && displayedItems.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {displayedItems.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    category={categories.find((c) => c.id === listing.categoryId)}
                    breed={breeds.find((b) => b.id === listing.breedId)}
                    subCategory={categories.find((c) => c.id === listing.subCategoryId)}
                    region={regions.find((r) => r.id === listing.regionId)}
                    seller={sellers.find((s) => s.userId === listing.sellerId)}
                    isFavorite={favoriteIds.includes(listing.id)}
                    isLiked={likedListingIds.includes(listing.id)}
                    onSelect={onSelectListing}
                    onSelectSeller={onSelectSeller}
                    onToggleFavorite={onToggleFavorite}
                    onToggleLike={onToggleLike}
                  />
                ))}
              </div>

              {/* Server-Side Pagination Footer ("عرض المزيد") */}
              <div className="mt-6 pt-6 border-t border-[var(--color-border)] flex flex-col items-center gap-3 text-center">
                <p className="text-xs text-[var(--color-muted)] tabular-nums">
                  تم عرض {displayedItems.length} من أصل {totalCount} إعلان
                </p>
                {totalCount > 0 && (
                  <div
                    className="w-48 h-1.5 rounded-full bg-[var(--color-cream)] overflow-hidden border border-[var(--color-border)]/70"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full bg-[var(--color-green)] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
                {hasMore && (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="min-h-[44px] px-7 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        <span>جاري تحميل المزيد...</span>
                      </>
                    ) : (
                      <span>عرض المزيد ({remainingCount} إعلان متبقٍ)</span>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
