import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
  Moon,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sun,
  ThumbsUp,
  User as UserIcon,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import type { AppNotification, User } from '../types/marketplace';
import { formatRelativeArabicTime } from '../lib/format';
import { getRoleAwareNavItems } from '../lib/marketplace-helpers';
import type { AuthMode, DashboardTab, PageView } from '../lib/router';

export type { PageView };

interface HeaderProps {
  currentPage: PageView;
  activeDashboardTab?: DashboardTab | null;
  onNavigate: (
    page: PageView,
    options?: { authMode?: AuthMode; dashboardTab?: DashboardTab }
  ) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  notifications: AppNotification[];
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllNotificationsRead: () => void;
  currentUser: User | null;
  onLogout: () => void;
}

function formatRoleLabel(role: User['role']): string {
  if (role === 'admin') return 'مشرف المنصة';
  if (role === 'seller') return 'مربي / بائع';
  return 'مشتري';
}

export function Header({
  currentPage,
  activeDashboardTab,
  onNavigate,
  theme,
  onToggleTheme,
  notifications,
  onOpenNotification,
  onMarkAllNotificationsRead,
  currentUser,
  onLogout,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileDrawerRef = useRef<HTMLDivElement | null>(null);
  const mobileToggleBtnRef = useRef<HTMLButtonElement | null>(null);

  const isLoggedIn = Boolean(currentUser);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const navItems = getRoleAwareNavItems(currentUser?.role ?? null);

  useEffect(() => {
    if (!isLoggedIn) {
      setNotifOpen(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!notifOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideDrawer = mobileDrawerRef.current?.contains(target);
      const onToggle = mobileToggleBtnRef.current?.contains(target);
      if (!insideDrawer && !onToggle) {
        setMobileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        mobileToggleBtnRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen]);

  const handleNav = (
    page: PageView,
    options?: { authMode?: AuthMode; dashboardTab?: DashboardTab }
  ) => {
    onNavigate(page, options);
    setMobileOpen(false);
    setNotifOpen(false);
  };

  const isNavItemActive = (item: ReturnType<typeof getRoleAwareNavItems>[number]) => {
    if (item.page === 'dashboard' && item.dashboardTab === 'admin') {
      return currentPage === 'dashboard' && activeDashboardTab === 'admin';
    }
    if (item.page === 'dashboard' && currentPage === 'dashboard') {
      return activeDashboardTab !== 'admin';
    }
    return (
      currentPage === item.page ||
      (item.page === 'listings' && currentPage === 'detail')
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[var(--color-surface)]/95 backdrop-blur-md border-b border-[var(--color-border)] transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleNav('home')}
            className="flex items-center gap-2 text-[var(--color-green-ink)] font-display text-base sm:text-xl font-extrabold tracking-tight whitespace-nowrap shrink-0 rounded-lg py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-gold)] cursor-pointer"
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden="true"
              className="shrink-0 w-7 h-7 sm:w-8 sm:h-8"
            >
              <rect width="32" height="32" rx="8" fill="#0B3A29" />
              <rect
                x="0.75"
                y="0.75"
                width="30.5"
                height="30.5"
                rx="7.25"
                stroke="#D79A3D"
                strokeOpacity="0.45"
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

          {/* Zone 2: Clean Single-Line Role-Aware Navigation */}
          <nav
            className="hidden md:flex items-center gap-4 lg:gap-7"
            aria-label="التنقل الرئيسي"
          >
            {navItems.map((item) => {
              const active = isNavItemActive(item);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    handleNav(item.page, {
                      dashboardTab: item.dashboardTab,
                    })
                  }
                  aria-current={active ? 'page' : undefined}
                  className={`relative py-2 text-xs lg:text-sm whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-gold)] ${
                    active
                      ? 'text-[var(--color-green-ink)] font-bold'
                      : 'text-[var(--color-muted)] font-medium hover:text-[var(--color-ink)]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-[var(--color-gold)] rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme Toggle + Account / Auth + Notifications + Primary CTA */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع المظلم'
              }
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع المظلم'}
              aria-pressed={theme === 'dark'}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] flex items-center justify-center text-[var(--color-ink)] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
            >
              {theme === 'dark' ? (
                <Sun size={16} className="text-[var(--color-gold)]" aria-hidden="true" />
              ) : (
                <Moon size={16} className="text-[var(--color-green-ink)]" aria-hidden="true" />
              )}
            </button>

            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => handleNav('dashboard')}
                  aria-label={`حساب ${currentUser.name} (${formatRoleLabel(currentUser.role)})`}
                  title={`${currentUser.name} — ${formatRoleLabel(currentUser.role)}`}
                  className="hidden sm:inline-flex h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/80 hover:bg-[var(--color-cream)] items-center gap-2 text-xs font-semibold text-[var(--color-ink)] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  <UserIcon
                    size={15}
                    className="text-[var(--color-green-ink)] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="max-w-[96px] xl:max-w-[140px] truncate">
                    {currentUser.name}
                  </span>
                </button>

                {/* Real-Time Notifications Bell & Dropdown (Authenticated Users Only) */}
                <div className="relative" ref={notifContainerRef}>
                  <button
                    type="button"
                    onClick={() => setNotifOpen((prev) => !prev)}
                    aria-label={`الإشعارات${unreadCount > 0 ? ` (${unreadCount} غير مقروء)` : ''}`}
                    aria-expanded={notifOpen}
                    aria-haspopup="true"
                    className="relative w-11 h-11 sm:w-10 sm:h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] flex items-center justify-center text-[var(--color-ink)] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                  >
                    <Bell size={16} aria-hidden="true" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 px-1 rounded-md bg-[var(--color-gold)] text-[#14261D] text-[11px] font-extrabold tabular-nums flex items-center justify-center border border-[var(--color-surface)]">
                        {unreadCount > 9 ? '+9' : unreadCount}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div
                      role="region"
                      aria-label="قائمة الإشعارات"
                      className="fixed inset-x-3 top-[68px] w-auto sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 bg-[var(--color-cream)]/70 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-[var(--color-ink)]">
                          الإشعارات ({notifications.length})
                        </span>
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={onMarkAllNotificationsRead}
                            className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                          >
                            تحديد الكل كمقروء
                          </button>
                        )}
                      </div>

                      <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto divide-y divide-[var(--color-border)]">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center space-y-2">
                            <div className="w-10 h-10 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-muted)] flex items-center justify-center mx-auto">
                              <Bell size={18} aria-hidden="true" />
                            </div>
                            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                              لا توجد إشعارات حالياً. ستصلك التنبيهات فور تلقي رسالة أو سؤال أو رد أو إعجاب جديد أو تحديث على عرض سعر.
                            </p>
                          </div>
                        ) : (
                          notifications.slice(0, 12).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                onOpenNotification(item);
                                setNotifOpen(false);
                              }}
                              className={`w-full text-right p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                                item.read
                                  ? 'bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/50'
                                  : 'bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)]'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center mt-0.5 shrink-0">
                                {item.type === 'offer_accepted' ||
                                item.type === 'listing_approved' ? (
                                  <CheckCircle2
                                    size={16}
                                    className="text-[var(--color-green-ink)]"
                                    aria-hidden="true"
                                  />
                                ) : item.type === 'offer_rejected' ||
                                  item.type === 'listing_rejected' ? (
                                  <XCircle
                                    size={16}
                                    className="text-red-700 dark:text-red-400"
                                    aria-hidden="true"
                                  />
                                ) : item.type === 'seller_verified' ? (
                                  <ShieldCheck
                                    size={16}
                                    className="text-[var(--color-green-ink)]"
                                    aria-hidden="true"
                                  />
                                ) : item.type === 'seller_verification_rejected' ? (
                                  <ShieldAlert
                                    size={16}
                                    className="text-red-700 dark:text-red-400"
                                    aria-hidden="true"
                                  />
                                ) : item.type === 'new_comment' ||
                                  item.type === 'comment_reply' ? (
                                  <MessageCircle
                                    size={16}
                                    className="text-[var(--color-green-ink)]"
                                    aria-hidden="true"
                                  />
                                ) : item.type === 'listing_liked' ? (
                                  <ThumbsUp
                                    size={16}
                                    className="text-[var(--color-gold)]"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <MessageSquare
                                    size={16}
                                    className="text-[var(--color-gold)]"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold text-[var(--color-ink)] truncate">
                                    {item.title}
                                  </p>
                                  {!item.read && (
                                    <span className="px-1.5 py-0.5 rounded bg-[var(--color-gold-soft)] text-[var(--color-ink)] text-[10px] font-bold shrink-0">
                                      جديد
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2 leading-relaxed">
                                  {item.body}
                                </p>
                                <p className="text-[11px] text-[var(--color-muted)]/80 mt-1 tabular-nums">
                                  {formatRelativeArabicTime(item.createdAt)}
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="تسجيل الخروج"
                  title="تسجيل الخروج"
                  className="hidden sm:inline-flex h-10 px-2.5 xl:px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span className="hidden xl:inline">خروج</span>
                </button>
              </>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNav('login', { authMode: 'login' })}
                  aria-label="تسجيل الدخول"
                  className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  <LogIn size={15} aria-hidden="true" />
                  <span>دخول</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNav('login', { authMode: 'register' })}
                  aria-label="إنشاء حساب جديد"
                  className="hidden lg:inline-flex h-10 px-3 rounded-lg border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                >
                  <UserPlus size={15} aria-hidden="true" />
                  <span>حساب جديد</span>
                </button>
              </div>
            )}

            <span
              aria-hidden="true"
              className="hidden sm:block h-5 w-px bg-[var(--color-border)] mx-0.5"
            />

            <button
              type="button"
              onClick={() => handleNav('add')}
              className="min-h-[44px] sm:min-h-[40px] sm:h-10 px-3 sm:px-4 lg:px-5 text-xs sm:text-sm font-semibold text-white bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] rounded-lg border border-[var(--color-gold)]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus size={15} className="hidden sm:inline shrink-0" aria-hidden="true" />
              <span>أضف إعلانك</span>
            </button>

            <button
              ref={mobileToggleBtnRef}
              type="button"
              onClick={() => {
                setNotifOpen(false);
                setMobileOpen((prev) => !prev);
              }}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              className="md:hidden w-11 h-11 flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)] cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
              aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            >
              {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer with Backdrop, Outside-Click, and Escape Dismissal */}
        {mobileOpen && (
          <div
            id="mobile-nav-drawer"
            ref={mobileDrawerRef}
            role="navigation"
            aria-label="قائمة التنقل للجوال"
            className="md:hidden relative z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 space-y-3 shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto"
          >
            {currentUser ? (
              <div className="p-3.5 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-ink)] truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {formatRoleLabel(currentUser.role)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleNav('dashboard')}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-green-ink)] shrink-0 cursor-pointer"
                >
                  لوحة حسابي
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleNav('login', { authMode: 'login' })}
                  className="min-h-[44px] px-3 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogIn size={15} aria-hidden="true" />
                  <span>تسجيل الدخول</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNav('login', { authMode: 'register' })}
                  className="min-h-[44px] px-3 rounded-lg border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus size={15} aria-hidden="true" />
                  <span>إنشاء حساب</span>
                </button>
              </div>
            )}

            <div className="space-y-1">
              {navItems.map((item) => {
                const active = isNavItemActive(item);
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() =>
                      handleNav(item.page, {
                        dashboardTab: item.dashboardTab,
                      })
                    }
                    className={`w-full min-h-[44px] text-right px-3.5 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--color-cream)] text-[var(--color-green-ink)] font-bold border border-[var(--color-border)]'
                        : 'text-[var(--color-ink)]/85 font-medium hover:bg-[var(--color-cream)]/60'
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="w-1.5 h-5 rounded-full bg-[var(--color-gold)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {currentUser && (
              <div className="pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    onLogout();
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg text-right text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-2 cursor-pointer"
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Backdrop for Mobile Drawer */}
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 top-16 z-30 bg-black/45 md:hidden"
        />
      )}
    </>
  );
}
