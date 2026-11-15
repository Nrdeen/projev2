import type { Breed, Category, IndicativePrice } from '../types/marketplace';
import { formatPriceSar } from '../lib/format';
import { SafeImage } from './SafeImage';

interface BreedsAndPricesViewProps {
  breeds: Breed[];
  categories: Category[];
  indicativePrices: IndicativePrice[];
  onFilterByBreed: (breedId: string) => void;
}

export function BreedsAndPricesView({
  breeds,
  categories,
  indicativePrices,
  onFilterByBreed,
}: BreedsAndPricesViewProps) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Breed Directory */}
      <div>
        <div className="pb-6 border-b border-[var(--color-border)]">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]">
            دليل السلالات السعودية المعتمدة
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            موسوعة مرجعية لأشهر سلالات الأغنام والماعز في السوق السعودي وخصائصها الإنتاجية.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {breeds.map((breed) => {
            const cat = categories.find((c) => c.id === breed.categoryId);
            return (
              <article
                key={breed.id}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-[var(--color-cream)]">
                  <SafeImage
                    src={breed.imageUrl}
                    alt={breed.name}
                    width={800}
                    height={597}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <div className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
                      <span className="font-semibold text-[var(--color-green-ink)]">
                        {cat?.name || 'أغنام'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>الموطن: {breed.origin}</span>
                    </div>
                    <h2 className="mt-1 font-display text-xl font-bold text-[var(--color-ink)]">
                      سلالة {breed.name}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                      {breed.summary}
                    </p>
                    <ul className="mt-3 space-y-1 text-xs text-[var(--color-ink)]">
                      {breed.characteristics.map((ch, idx) => (
                        <li key={idx}>— {ch}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <span className="text-[var(--color-muted)] block">الوزن الشائع</span>
                      <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                        {breed.avgWeightKg}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFilterByBreed(breed.id)}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--color-cream)] hover:bg-[var(--color-green)] hover:text-white text-[var(--color-green-ink)] text-xs font-semibold transition-colors cursor-pointer"
                    >
                      تصفح إعلانات {breed.name}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Indicative Market Prices Table */}
      <div className="bg-[var(--color-cream)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="mb-5">
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]">
            الأسعار الاسترشادية في السوق السعودي
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            متوسطات استرشادية محدثة بالريال السعودي لمساعدة المربين والمشترين على التقييم العادل.
          </p>
        </div>

        <div className="overflow-x-auto bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-cream)]/60 text-xs font-semibold text-[var(--color-muted)]">
                <th className="py-3.5 px-4">السلالة</th>
                <th className="py-3.5 px-4">الفئة العمرية</th>
                <th className="py-3.5 px-4">النطاق السعري</th>
                <th className="py-3.5 px-4">المتوسط الاسترشادي</th>
                <th className="py-3.5 px-4">حالة السوق</th>
                <th className="py-3.5 px-4">النطاق الجغرافي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] text-sm">
              {indicativePrices.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--color-cream)]/40">
                  <td className="py-3.5 px-4 font-semibold text-[var(--color-ink)]">
                    {row.breedName}
                  </td>
                  <td className="py-3.5 px-4 text-[var(--color-muted)]">{row.ageGroup}</td>
                  <td className="py-3.5 px-4 tabular-nums text-[var(--color-ink)]">
                    {formatPriceSar(row.minPrice)} — {formatPriceSar(row.maxPrice)}
                  </td>
                  <td className="py-3.5 px-4 font-display font-bold text-[var(--color-green-ink)] tabular-nums">
                    {formatPriceSar(row.avgPrice)}
                  </td>
                  <td className="py-3.5 px-4 text-xs font-medium">
                    {row.trend === 'up' && (
                      <span className="text-[var(--color-green-ink)]">طلب مرتفع</span>
                    )}
                    {row.trend === 'stable' && (
                      <span className="text-[var(--color-muted)]">مستقر</span>
                    )}
                    {row.trend === 'down' && (
                      <span className="text-[var(--color-gold)]">عرض وافر</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-[var(--color-muted)]">{row.regionNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
