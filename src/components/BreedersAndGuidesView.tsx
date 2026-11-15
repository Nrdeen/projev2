import { useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import type { Article, FAQ, IndicativePrice, SellerProfile } from '../types/marketplace';
import { formatPriceSar } from '../lib/format';
import { partitionSellersByVerification } from '../lib/marketplace-helpers';
import { Modal } from './Modal';
import { SafeImage } from './SafeImage';
import { VerifiedSellerBadge } from './VerifiedSellerBadge';

interface BreedersAndGuidesViewProps {
  sellers: SellerProfile[];
  articles: Article[];
  faqs: FAQ[];
  indicativePrices: IndicativePrice[];
  onOpenSeller: (sellerId: string) => void;
}

export function BreedersAndGuidesView({
  sellers,
  articles,
  faqs,
  indicativePrices,
  onOpenSeller,
}: BreedersAndGuidesViewProps) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0]?.id || null);
  const { verifiedSellers, otherSellers } = partitionSellersByVerification(sellers);

  const renderSellerCard = (seller: SellerProfile, verified: boolean) => (
    <article
      key={seller.userId}
      className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 flex flex-col justify-between gap-4"
    >
      <div>
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
          <span>{seller.city}</span>
          {verified ? (
            <VerifiedSellerBadge variant="badge" />
          ) : (
            <span className="text-[11px] font-medium text-[var(--color-muted)]">
              {seller.verificationStatus === 'Pending' ? 'قيد مراجعة التوثيق' : 'حساب غير موثق بعد'}
            </span>
          )}
        </div>

        <h2 className="mt-2 font-display text-lg font-bold text-[var(--color-ink)]">
          {seller.displayName}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">{seller.bio}</p>
      </div>

      <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--color-muted)] tabular-nums min-w-0">
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-ink)] flex-wrap">
            <Star
              size={13}
              className="text-[var(--color-gold)] fill-[var(--color-gold)]"
              aria-hidden="true"
            />
            <span>{seller.rating.toFixed(1)}</span>
            {seller.ratingCount !== undefined && (
              <span className="font-normal text-[var(--color-muted)]">({seller.ratingCount})</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-normal text-[var(--color-muted)]">{seller.specialty}</span>
          </span>
          <span className="block mt-0.5">
            خبرة {seller.yearsExperience} سنة · {seller.totalSales} عملية بيع
          </span>
        </div>
        <button
          type="button"
          onClick={() => onOpenSeller(seller.userId)}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold shrink-0 cursor-pointer"
        >
          عرض المراح
        </button>
      </div>
    </article>
  );

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
      {/* Verified Breeders */}
      <div>
        <div className="pb-6 border-b border-[var(--color-border)]">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]">
            المربون الموثقون وأدلة السوق
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            مزارع ومراحات معتمدة وموثقة من إدارة المنصة، مع دليل المقالات والأسئلة الشائعة ومؤشر الأسعار.
          </p>
        </div>

        {verifiedSellers.length === 0 ? (
          <div className="mt-6 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 text-center">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              لا يوجد مربون موثقون معروضون في هذه القائمة حالياً.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {verifiedSellers.map((seller) => renderSellerCard(seller, true))}
          </div>
        )}

        {otherSellers.length > 0 && (
          <div className="mt-12 pt-8 border-t border-[var(--color-border)]">
            <div className="mb-6">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-ink)]">
                مربون وبائعون آخرون في السوق
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                حسابات مراحات وبائعين مسجلة في المنصة لم تُستكمل إجراءات توثيقها المعتمدة بعد.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {otherSellers.map((seller) => renderSellerCard(seller, false))}
            </div>
          </div>
        )}
      </div>

      {/* Indicative Price Strip */}
      <div className="bg-[var(--color-cream)] rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="font-display text-xl font-bold text-[var(--color-ink)] mb-4">
          ملخص الأسعار الاسترشادية اليوم
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {indicativePrices.map((p) => (
            <div
              key={p.id}
              className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4"
            >
              <p className="text-xs text-[var(--color-muted)]">{p.ageGroup}</p>
              <p className="font-display text-base font-bold text-[var(--color-ink)] mt-0.5">
                {p.breedName}
              </p>
              <p className="font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums mt-2">
                {formatPriceSar(p.avgPrice)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums mt-1">
                من {formatPriceSar(p.minPrice)} إلى {formatPriceSar(p.maxPrice)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Articles */}
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--color-ink)] mb-6">
          مقالات وإرشادات للمربين والمشترين
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {articles.map((article) => (
            <article
              key={article.id}
              className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden flex flex-col"
            >
              <div className="aspect-[4/3] bg-[var(--color-cream)]">
                <SafeImage
                  src={article.imageUrl}
                  alt={article.title}
                  width={800}
                  height={597}
                  loading="lazy"
                  className="w-full h-full object-cover"
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
                  <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                    {article.excerpt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedArticle(article)}
                  className="min-h-[44px] inline-flex items-center text-sm font-semibold text-[var(--color-green-ink)] hover:underline text-right cursor-pointer"
                >
                  قراءة المقال كاملاً
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="max-w-3xl">
        <h2 className="font-display text-2xl font-bold text-[var(--color-ink)] mb-5">
          الأسئلة الشائعة
        </h2>
        <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] overflow-hidden">
          {faqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <div key={faq.id}>
                <button
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  className="w-full px-5 py-4 text-right flex items-center justify-between gap-4 hover:bg-[var(--color-cream)]/50 cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-bold text-[var(--color-ink)]">
                    {faq.question}
                  </span>
                  <ChevronDown
                    size={18}
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

      {/* Article Reader Modal */}
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
