import type { Breed, User } from '../types/marketplace';
import { getRoleAwareFooterAccountLinks } from '../lib/marketplace-helpers';
import type { AuthMode, DashboardTab, PageView } from '../lib/router';

interface FooterProps {
  currentUser: User | null;
  breeds?: Breed[];
  onNavigate: (
    page: PageView,
    options?: {
      authMode?: AuthMode;
      dashboardTab?: DashboardTab;
      listingFilters?: { breedId?: string };
    }
  ) => void;
}

export function Footer({ currentUser, breeds = [], onNavigate }: FooterProps) {
  const accountLinks = getRoleAwareFooterAccountLinks(currentUser?.role ?? null);

  return (
    <footer className="bg-[var(--color-footer)] text-[#FAF6EC] border-t border-[var(--color-border)] mt-16 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10 pb-10 border-b border-white/10">
          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-5 space-y-4">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="inline-flex items-center gap-2.5 text-white font-display text-xl font-extrabold cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-gold)]"
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect width="32" height="32" rx="8" fill="#145C42" />
                <rect
                  x="0.75"
                  y="0.75"
                  width="30.5"
                  height="30.5"
                  rx="7.25"
                  stroke="#D79A3D"
                  strokeOpacity="0.55"
                  strokeWidth="1.25"
                />
                <path
                  d="M9.5 18.5C9.5 14.5 12.4 11.5 16 11.5C19.6 11.5 22.5 14.5 22.5 18.5C22.5 21 20.6 22.5 18.5 22.5H13.5C11.4 22.5 9.5 21 9.5 18.5Z"
                  stroke="#FAF6EC"
                  strokeWidth="1.75"
                />
                <path
                  d="M11.5 12.5C9.2 11.2 8 12.6 8.5 14.8M20.5 12.5C22.8 11.2 24 12.6 23.5 14.8"
                  stroke="#D79A3D"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
              <span>سوق الغنم</span>
            </button>
            <p className="text-sm text-[#FAF6EC]/80 max-w-md leading-relaxed">
              منصة سعودية متخصصة لإعلانات المواشي، تجمع المربين والبائعين والمشترين في بيئة منظمة بمواصفات واضحة للعمر والوزن والتحصين والأسعار الاسترشادية بالريال السعودي.
            </p>
          </div>

          {/* Marketplace Sections */}
          <div className="lg:col-span-2">
            <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">أقسام المنصة</h2>
            <ul className="space-y-2 text-sm text-[#FAF6EC]/85">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="min-h-[44px] sm:min-h-[32px] inline-flex items-center py-1 hover:text-white transition-colors cursor-pointer text-right rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  الرئيسية
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('listings')}
                  className="min-h-[44px] sm:min-h-[32px] inline-flex items-center py-1 hover:text-white transition-colors cursor-pointer text-right rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  جميع الإعلانات
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('breeds')}
                  className="min-h-[44px] sm:min-h-[32px] inline-flex items-center py-1 hover:text-white transition-colors cursor-pointer text-right rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  دليل السلالات والأسعار
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('breeders')}
                  className="min-h-[44px] sm:min-h-[32px] inline-flex items-center py-1 hover:text-white transition-colors cursor-pointer text-right rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  المربون والأدلة
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('add')}
                  className="min-h-[44px] sm:min-h-[32px] inline-flex items-center py-1 hover:text-white transition-colors cursor-pointer text-right rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  أضف إعلانك
                </button>
              </li>
            </ul>
          </div>

          {/* Breeds Directory Quick Links */}
          <div className="lg:col-span-2">
            <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">السلالات الشائعة</h2>
            <ul className="space-y-2 text-sm text-[#FAF6EC]/85">
              {(breeds.length > 0
                ? breeds.slice(0, 5)
                : [
                    { id: 'brd_naimi', name: 'نعيمي' },
                    { id: 'brd_najdi', name: 'نجدي' },
                    { id: 'brd_harri', name: 'حري' },
                    { id: 'brd_ardhi', name: 'عارضي' },
                    { id: 'brd_sawakni', name: 'سواكني' },
                  ]
              ).map((breed) => (
                <li key={breed.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('listings', { listingFilters: { breedId: breed.id } })
                    }
                    className="min-h-[44px] sm:min-h-[32px] inline-flex items-center py-1 hover:text-white transition-colors cursor-pointer text-right rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                  >
                    إعلانات {breed.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Role-Aware Account Links */}
          <div className="lg:col-span-3">
            <h2 className="text-sm font-bold text-[var(--color-gold)] mb-3.5">
              {currentUser ? 'الحساب والخدمات' : 'حسابك في السوق'}
            </h2>
            <ul className="space-y-2 text-sm text-[#FAF6EC]/85">
              {accountLinks.map((link) => (
                <li key={link.key}>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate(link.page, {
                        authMode: link.authMode,
                        dashboardTab: link.dashboardTab,
                      })
                    }
                    className="min-h-[44px] sm:min-h-[32px] inline-flex items-center py-1 hover:text-white transition-colors cursor-pointer text-right rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#FAF6EC]/70 text-center sm:text-right">
          <p>© 2026 سوق الغنم — المملكة العربية السعودية. جميع الأسعار بالريال السعودي.</p>
          <p>تواصل مباشر بين المربين والمشترين · إعلانات خاضعة لمراجعة الإدارة</p>
        </div>
      </div>
    </footer>
  );
}
