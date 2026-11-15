import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Heart,
  Lock,
  MessageCircle,
  MessageSquare,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import type {
  AppNotification,
  AuditLog,
  Breed,
  Category,
  Conversation,
  Listing,
  PriceOffer,
  Region,
  SellerProfile,
  SellerVerificationState,
  User,
} from '../types/marketplace';
import { api } from '../lib/api';
import { formatPriceSar, formatRelativeArabicTime, formatStatusLabel } from '../lib/format';
import { scopeAnalyticsDataset } from '../lib/analytics';
import { ListingCard } from './ListingCard';
import { SafeImage } from './SafeImage';
import { VerifiedSellerBadge } from './VerifiedSellerBadge';

// Recharts & AdminDashboardPanel are loaded on demand so buyers/sellers do not pay for chart or admin code upfront.
const DashboardAnalytics = lazy(() =>
  import('./DashboardAnalytics').then((m) => ({ default: m.DashboardAnalytics })),
);
const AdminDashboardPanel = lazy(() =>
  import('./AdminDashboardPanel').then((m) => ({ default: m.AdminDashboardPanel })),
);

export type DashboardTab = 'my-listings' | 'favorites' | 'likes' | 'messages' | 'analytics' | 'admin';

interface DashboardViewProps {
  requestedTab?: DashboardTab | null;
  requestedConvId?: string | null;
  onClearNavigationHint?: () => void;
  onTabChange?: (
    tab: DashboardTab,
    options?: { replace?: boolean; conversationId?: string | null }
  ) => void;
  currentUser: User;
  allListings: Listing[];
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  sellers: SellerProfile[];
  favoriteIds: string[];
  likedListingIds: string[];
  conversations: Conversation[];
  priceOffers: PriceOffer[];
  auditLogs: AuditLog[];
  onLogout: () => Promise<void>;
  onSelectListing: (listing: Listing) => void;
  onSelectSeller?: (sellerId: string) => void;
  onBrowseListings?: () => void;
  onAddListing?: () => void;
  onEditListing: (listing: Listing) => void;
  onToggleFavorite: (listingId: string) => void;
  onToggleLike: (listingId: string) => void;
  onMarkSold: (listingId: string) => Promise<void>;
  onSendMessage: (conversationId: string, body: string) => Promise<void>;
  onMarkConversationRead?: (conversationId: string) => Promise<void> | void;
  onRespondToOffer: (offerId: string, status: 'accepted' | 'rejected') => Promise<void>;
  onApproveListing: (listingId: string) => Promise<void>;
  onRejectListing: (listingId: string, reason: string) => Promise<void>;
  onCreateBreed: (payload: {
    name: string;
    categoryId: string;
    origin: string;
    summary: string;
    avgWeightKg: string;
    priceRangeSar: string;
  }) => Promise<void>;
  onCreateSubCategory: (payload: {
    name: string;
    parentId: string;
    description: string;
    keywords: string;
  }) => Promise<void>;
  onUpdateSubCategory: (
    id: string,
    payload: {
      name: string;
      parentId: string;
      description: string;
      keywords: string;
    }
  ) => Promise<void>;
  onDeleteSubCategory: (id: string) => Promise<void>;
  onAutoCategorizeListings: (payload?: { listingId?: string; subCategoryId?: string }) => Promise<void>;
  onRefreshData?: () => Promise<void>;
  onNotify?: (message: string) => void;
  notifications?: AppNotification[];
  onOpenNotification?: (item: AppNotification) => void;
  onMarkAllNotificationsRead?: () => void;
}

function getListingStatusBadge(status: Listing['status']) {
  if (status === 'Published') {
    return {
      label: formatStatusLabel(status),
      cls: 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25',
      Icon: CheckCircle2,
    };
  }
  if (status === 'Pending') {
    return {
      label: formatStatusLabel(status),
      cls: 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/35',
      Icon: Clock,
    };
  }
  if (status === 'Rejected') {
    return {
      label: formatStatusLabel(status),
      cls: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60',
      Icon: XCircle,
    };
  }
  return {
    label: formatStatusLabel(status),
    cls: 'bg-[var(--color-cream)] text-[var(--color-muted)] border-[var(--color-border)]',
    Icon: CheckCircle2,
  };
}

function AnalyticsFallback() {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-muted)]">جاري تحميل الرسوم البيانية...</p>
    </div>
  );
}

function AdminPanelFallback() {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-muted)]">جاري تحميل لوحة الإدارة...</p>
    </div>
  );
}

export function DashboardView({
  requestedTab,
  requestedConvId,
  onClearNavigationHint,
  onTabChange,
  currentUser,
  allListings,
  categories,
  breeds,
  regions,
  sellers,
  favoriteIds,
  likedListingIds,
  conversations,
  priceOffers,
  auditLogs,
  onLogout,
  onSelectListing,
  onSelectSeller,
  onBrowseListings,
  onAddListing,
  onEditListing,
  onToggleFavorite,
  onToggleLike,
  onMarkSold,
  onSendMessage,
  onMarkConversationRead,
  onRespondToOffer,
  onApproveListing,
  onRejectListing,
  onCreateBreed,
  onCreateSubCategory,
  onUpdateSubCategory,
  onDeleteSubCategory,
  onAutoCategorizeListings,
  onRefreshData,
  onNotify,
  notifications = [],
  onOpenNotification,
  onMarkAllNotificationsRead,
}: DashboardViewProps) {
  const resolveAllowedTab = useCallback(
    (tab: DashboardTab | null | undefined): DashboardTab => {
      if (tab === 'admin' && currentUser.role !== 'admin') {
        return 'my-listings';
      }
      return tab || (currentUser.role === 'admin' ? 'admin' : 'my-listings');
    },
    [currentUser.role]
  );

  const [activeTab, setActiveTab] = useState<DashboardTab>(() => resolveAllowedTab(requestedTab));
  const [selectedConvId, setSelectedConvId] = useState<string>(
    requestedConvId || conversations[0]?.id || ''
  );
  const [mobileThreadOpen, setMobileThreadOpen] = useState<boolean>(() => Boolean(requestedConvId));
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true
  );

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastMarkedReadKeyRef = useRef<string>('');

  const [myVerification, setMyVerification] = useState<SellerVerificationState | null>(null);
  const [requestingVerification, setRequestingVerification] = useState(false);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const userInitial = currentUser.name.trim().charAt(0) || 'م';

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktopViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const loadMyVerification = useCallback(async () => {
    try {
      const res = await api.getMySellerVerification();
      setMyVerification(res.seller);
    } catch {
      // Ignore silent check failure
    }
  }, []);

  useEffect(() => {
    loadMyVerification();
  }, [loadMyVerification, currentUser.id]);

  const handleRequestVerification = async () => {
    setRequestingVerification(true);
    try {
      const res = await api.requestSellerVerification();
      setMyVerification(res.seller);
      onNotify?.('تم إرسال طلب توثيق المربي لمراجعة الإدارة');
      await onRefreshData?.();
    } catch (err: any) {
      onNotify?.(err?.message || 'تعذر إرسال طلب التوثيق');
    } finally {
      setRequestingVerification(false);
    }
  };

  useEffect(() => {
    if (requestedTab || requestedConvId) {
      if (requestedTab) {
        const resolved = resolveAllowedTab(requestedTab);
        setActiveTab(resolved);
        if (resolved !== requestedTab) {
          onTabChange?.(resolved, { replace: true });
        }
      } else if (requestedConvId) {
        setActiveTab('messages');
      }
      if (requestedConvId) {
        setSelectedConvId(requestedConvId);
        setMobileThreadOpen(true);
      }
      onClearNavigationHint?.();
    }
  }, [requestedTab, requestedConvId, onClearNavigationHint, resolveAllowedTab, onTabChange]);

  const handleSelectTab = (tab: DashboardTab) => {
    const allowed = resolveAllowedTab(tab);
    setActiveTab(allowed);
    if (allowed !== 'messages') {
      setMobileThreadOpen(false);
    }
    onTabChange?.(allowed);
  };

  const myListings = useMemo(
    () => allListings.filter((l) => l.sellerId === currentUser.id),
    [allListings, currentUser.id]
  );

  const myOffers = useMemo(
    () =>
      priceOffers.filter(
        (o) =>
          o.sellerId === currentUser.id ||
          o.buyerId === currentUser.id ||
          currentUser.role === 'admin'
      ),
    [priceOffers, currentUser.id, currentUser.role]
  );

  const favoriteListings = useMemo(
    () => allListings.filter((l) => favoriteIds.includes(l.id) && l.status === 'Published'),
    [allListings, favoriteIds]
  );

  const likedListings = useMemo(
    () => allListings.filter((l) => likedListingIds.includes(l.id) && l.status === 'Published'),
    [allListings, likedListingIds]
  );

  const pendingListings = useMemo(
    () => allListings.filter((l) => l.status === 'Pending'),
    [allListings]
  );

  const scopedAnalytics = useMemo(
    () =>
      scopeAnalyticsDataset({
        userId: currentUser.id,
        isAdmin: currentUser.role === 'admin',
        allListings,
        priceOffers,
        conversations,
      }),
    [currentUser.id, currentUser.role, allListings, priceOffers, conversations]
  );

  const totalUnreadMessages = useMemo(
    () => conversations.reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0),
    [conversations]
  );

  const activeConv =
    conversations.find((c) => c.id === selectedConvId) || conversations[0] || null;

  // Keep selectedConvId synced if current selection disappears
  useEffect(() => {
    if (!activeConv && selectedConvId) {
      setSelectedConvId('');
      setMobileThreadOpen(false);
    } else if (activeConv && !selectedConvId) {
      setSelectedConvId(activeConv.id);
    }
  }, [activeConv, selectedConvId]);

  // Auto-scroll chat container to latest message whenever active conversation or message count changes
  useEffect(() => {
    if (activeTab !== 'messages' || !activeConv) return;
    if (!isDesktopViewport && !mobileThreadOpen) return;

    const rafId = window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ block: 'nearest' });
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeTab, activeConv?.id, activeConv?.messages.length, mobileThreadOpen, isDesktopViewport]);

  // Mark active conversation read when opened and visible to the user
  useEffect(() => {
    if (activeTab !== 'messages' || !activeConv || !onMarkConversationRead) return;
    if (!isDesktopViewport && !mobileThreadOpen) return;
    if ((activeConv.unreadCount ?? 0) <= 0) return;

    const lastMsgId = activeConv.messages[activeConv.messages.length - 1]?.id || 'empty';
    const key = `${activeConv.id}:${lastMsgId}`;
    if (lastMarkedReadKeyRef.current === key) return;
    lastMarkedReadKeyRef.current = key;

    Promise.resolve(onMarkConversationRead(activeConv.id)).catch(() => {
      lastMarkedReadKeyRef.current = '';
    });
  }, [activeTab, activeConv, mobileThreadOpen, isDesktopViewport, onMarkConversationRead]);

  const resolveConversationMeta = useCallback(
    (conv: Conversation) => {
      const listing = allListings.find((l) => l.id === conv.listingId);
      const otherId =
        conv.otherParticipantId ||
        (conv.buyerId === currentUser.id ? conv.sellerId : conv.buyerId);
      const otherSeller = sellers.find((s) => s.userId === otherId);
      const otherParticipantName =
        conv.otherParticipantName || otherSeller?.displayName || 'مستخدم';
      const listingTitle = listing?.title || conv.listingTitle || 'استفسار عن إعلان';
      const unreadCount = Number(conv.unreadCount) || 0;
      return {
        listing,
        listingTitle,
        otherId,
        otherParticipantName,
        unreadCount,
      };
    },
    [allListings, currentUser.id, sellers]
  );

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConvId(conv.id);
    setMobileThreadOpen(true);
    onTabChange?.('messages', { replace: true, conversationId: conv.id });
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      await onSendMessage(activeConv.id, replyText.trim());
      setReplyText('');
      window.requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    } catch {
      // The app already showed the error toast; keep the typed reply so the user can retry.
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8 overflow-x-hidden">
      {/* Account Bar */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div
              aria-hidden="true"
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[var(--color-green)] text-white flex items-center justify-center font-display text-xl font-extrabold shrink-0 border border-[var(--color-gold)]/40"
            >
              {userInitial}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--color-cream)] border border-[var(--color-border)] text-[11px] font-bold text-[var(--color-green-ink)]">
                  {currentUser.role === 'admin'
                    ? 'مشرف المنصة'
                    : currentUser.role === 'seller'
                    ? 'بائع / مربي'
                    : 'مشتري'}
                </span>
                {myVerification?.verificationStatus === 'Verified' && (
                  <VerifiedSellerBadge variant="compact" />
                )}
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] mt-1 break-words">
                مرحباً، {currentUser.name}
              </h1>
              <p className="text-xs text-[var(--color-muted)] tabular-nums mt-0.5">
                رقم الجوال: {currentUser.phone}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              aria-expanded={notificationsOpen}
              className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 border ${
                notificationsOpen
                  ? 'bg-[var(--color-cream)] border-[var(--color-green-ink)]/40 text-[var(--color-green-ink)]'
                  : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)]'
              }`}
            >
              <Bell size={15} aria-hidden="true" />
              <span>الإشعارات</span>
              {unreadNotificationsCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-md bg-[var(--color-gold)] text-[#14261D] text-[11px] font-extrabold tabular-nums inline-flex items-center justify-center">
                  {unreadNotificationsCount > 99 ? '+99' : unreadNotificationsCount}
                </span>
              )}
            </button>
            {onAddListing && (
              <button
                type="button"
                onClick={onAddListing}
                className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white inline-flex items-center gap-1.5"
              >
                <Plus size={15} aria-hidden="true" />
                <span>أضف إعلاناً</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onLogout()}
              className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream-hover)]"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>

        {/* Account Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/50">
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--color-muted)]">إعلاناتي</span>
            <span className="font-display font-extrabold text-sm text-[var(--color-ink)] tabular-nums">
              {myListings.length}
            </span>
          </div>
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--color-muted)]">عروض السوم</span>
            <span className="font-display font-extrabold text-sm text-[var(--color-green-ink)] tabular-nums">
              {myOffers.length}
            </span>
          </div>
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--color-muted)]">المفضلة</span>
            <span className="font-display font-extrabold text-sm text-[var(--color-ink)] tabular-nums">
              {favoriteListings.length}
            </span>
          </div>
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--color-muted)]">رسائل جديدة</span>
            <span className="font-display font-extrabold text-sm text-[var(--color-gold)] tabular-nums">
              {totalUnreadMessages}
            </span>
          </div>
        </div>

        {/* Collapsible Dashboard Notifications Feed */}
        {notificationsOpen && (
          <div
            aria-label="إشعارات الحساب"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/35 overflow-hidden"
          >
            <div className="px-4 py-3 bg-[var(--color-cream)] border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                <span className="font-display text-sm font-bold text-[var(--color-ink)]">
                  مركز الإشعارات ({notifications.length})
                </span>
              </div>
              {unreadNotificationsCount > 0 && onMarkAllNotificationsRead && (
                <button
                  type="button"
                  onClick={onMarkAllNotificationsRead}
                  className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                >
                  تحديد الكل كمقروء
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--color-muted)]">
                لا توجد إشعارات في سجل حسابك حالياً. ستصلك التنبيهات فور تلقي رسالة أو سؤال أو رد أو تحديث على إعلاناتك.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)] max-h-72 overflow-y-auto bg-[var(--color-surface)]">
                {notifications.slice(0, 15).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onOpenNotification?.(item);
                      setNotificationsOpen(false);
                    }}
                    className={`w-full text-right p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                      item.read
                        ? 'bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/40'
                        : 'bg-[var(--color-cream)]/80 hover:bg-[var(--color-cream)]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center shrink-0 mt-0.5">
                      {item.type === 'offer_accepted' || item.type === 'listing_approved' ? (
                        <CheckCircle2 size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'offer_rejected' || item.type === 'listing_rejected' ? (
                        <XCircle size={15} className="text-red-700 dark:text-red-400" aria-hidden="true" />
                      ) : item.type === 'seller_verified' ? (
                        <ShieldCheck size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'seller_verification_rejected' ? (
                        <ShieldAlert size={15} className="text-red-700 dark:text-red-400" aria-hidden="true" />
                      ) : item.type === 'new_comment' || item.type === 'comment_reply' ? (
                        <MessageCircle size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      ) : item.type === 'listing_liked' ? (
                        <ThumbsUp size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                      ) : (
                        <MessageSquare size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
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
                      <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-2 leading-relaxed">
                        {item.body}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted)]/80 mt-1 tabular-nums">
                        {formatRelativeArabicTime(item.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Role-Aware Navigation Segmented Tabs */}
      <div
        role="tablist"
        aria-label="أقسام لوحة حسابي"
        className="flex flex-wrap items-center gap-1.5 sm:gap-2 border-b border-[var(--color-border)] pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'my-listings'}
          onClick={() => handleSelectTab('my-listings')}
          className={`min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'my-listings'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          إعلاناتي ({myListings.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'favorites'}
          onClick={() => handleSelectTab('favorites')}
          className={`min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'favorites'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          المفضلة ({favoriteListings.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'likes'}
          onClick={() => handleSelectTab('likes')}
          className={`min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'likes'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          إعجاباتي ({likedListings.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'messages'}
          onClick={() => handleSelectTab('messages')}
          className={`min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            activeTab === 'messages'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          <span>المحادثات ({conversations.length})</span>
          {totalUnreadMessages > 0 && (
            <span
              aria-label={`${totalUnreadMessages} رسائل غير مقروءة`}
              className="min-w-[20px] h-5 px-1.5 rounded-md bg-[var(--color-gold)] text-[#14261D] text-[11px] font-extrabold tabular-nums inline-flex items-center justify-center"
            >
              {totalUnreadMessages > 99 ? '+99' : totalUnreadMessages}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          onClick={() => handleSelectTab('analytics')}
          className={`min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          {currentUser.role === 'admin' ? 'لوحة تحكم الأداء' : 'تحليلات إعلاناتي'}
        </button>
        {currentUser.role === 'admin' && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'admin'}
            onClick={() => handleSelectTab('admin')}
            className={`min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-[var(--color-gold)] text-[#14261D]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
            }`}
          >
            لوحة المشرف ({pendingListings.length} بانتظار المراجعة)
          </button>
        )}
      </div>

      {/* Tab 1: My Listings */}
      {activeTab === 'my-listings' && (
        <div className="space-y-8">
          {(currentUser.role === 'seller' || myListings.length > 0 || myVerification) && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--color-muted)]">
                    حالة توثيق المربي:
                  </span>
                  {myVerification?.verificationStatus === 'Verified' ? (
                    <VerifiedSellerBadge variant="badge" label="حساب مربي موثق ومعتمد" />
                  ) : myVerification?.verificationStatus === 'Rejected' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                      <ShieldAlert size={14} aria-hidden="true" />
                      <span>لم يُعتمد طلب التوثيق</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-gold)]">
                      <ShieldCheck size={14} aria-hidden="true" />
                      <span>
                        {myVerification
                          ? 'طلب التوثيق قيد مراجعة الإدارة'
                          : 'غير موثق بعد — يمكنك تقديم طلب توثيق'}
                      </span>
                    </span>
                  )}
                </div>
                {myVerification?.verificationNote && (
                  <p className="text-xs text-[var(--color-muted)]">
                    ملاحظة الإدارة: {myVerification.verificationNote}
                  </p>
                )}
              </div>

              {(!myVerification || myVerification.verificationStatus === 'Rejected') && (
                <button
                  type="button"
                  disabled={requestingVerification}
                  onClick={handleRequestVerification}
                  className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {requestingVerification
                    ? 'جاري الإرسال...'
                    : myVerification?.verificationStatus === 'Rejected'
                    ? 'إعادة إرسال طلب التوثيق'
                    : 'تقديم طلب توثيق مربي'}
                </button>
              )}
            </div>
          )}

          {myListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center mx-auto">
                <PackageOpen size={22} aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                  لا توجد إعلانات مسجلة في حسابك بعد
                </p>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  أضف إعلانك الأول مع صور واضحة ومواصفات السلالة والوزن والعمر ليظهر للمشترين بعد المراجعة، أو تصفح عروض السوق الحالية.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                {onAddListing && (
                  <button
                    type="button"
                    onClick={onAddListing}
                    className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>أضف إعلانك الأول</span>
                  </button>
                )}
                {onBrowseListings && (
                  <button
                    type="button"
                    onClick={onBrowseListings}
                    className="min-h-[44px] px-5 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-[var(--color-ink)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Search size={15} aria-hidden="true" />
                    <span>تصفح الإعلانات</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile card layout (320px - 767px): prevents horizontal clipping */}
              <div className="md:hidden space-y-3">
                {myListings.map((item) => {
                  const statusMeta = getListingStatusBadge(item.status);
                  const StatusIcon = statusMeta.Icon;
                  const breed = breeds.find((b) => b.id === item.breedId);
                  const thumbUrl = item.images[0]?.url || breed?.imageUrl;

                  return (
                    <article
                      key={item.id}
                      className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-14 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-cream)] shrink-0">
                          <SafeImage
                            src={thumbUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectListing(item)}
                              className="font-display font-bold text-sm text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer break-words min-w-0 flex-1"
                            >
                              {item.title}
                            </button>
                            <span
                              className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${statusMeta.cls}`}
                            >
                              <StatusIcon size={12} aria-hidden="true" />
                              <span>{statusMeta.label}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                            {breed?.name || 'حلال'} · {item.city} · {item.quantity} رأس
                          </p>
                        </div>
                      </div>

                      {item.rejectionReason && (
                        <p className="text-xs text-red-700 dark:text-red-400 break-words bg-red-50/70 dark:bg-red-950/30 rounded-lg px-2.5 py-1.5 border border-red-200/70 dark:border-red-900/50">
                          سبب الرفض: {item.rejectionReason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2 border-t border-[var(--color-border)]">
                        <div className="font-bold text-sm text-[var(--color-green-ink)] tabular-nums">
                          {formatPriceSar(item.priceAmount)}
                          {item.quantity > 1 && (
                            <span className="text-[11px] font-medium text-[var(--color-muted)] mr-1.5">
                              (الإجمالي: {formatPriceSar(item.priceAmount * item.quantity)})
                            </span>
                          )}
                        </div>
                        {item.expectedPrice && (
                          <p className="text-xs font-medium text-[var(--color-muted)] tabular-nums">
                            المتوقع: {formatPriceSar(item.expectedPrice)}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onEditListing(item)}
                          className="flex-1 min-w-[110px] min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Pencil size={13} aria-hidden="true" />
                          <span>
                            {item.status === 'Rejected' ||
                            item.status === 'Draft' ||
                            item.status === 'Expired'
                              ? 'تعديل وإعادة إرسال'
                              : 'تعديل'}
                          </span>
                        </button>
                        {item.status === 'Published' && (
                          <button
                            type="button"
                            onClick={() => onMarkSold(item.id)}
                            className="flex-1 min-w-[110px] min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center justify-center cursor-pointer"
                          >
                            تحديد كمباع
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Tablet & Desktop table (768px+) with horizontal scroll protection */}
              <div className="hidden md:block bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full min-w-[640px] text-right border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                      <th className="py-3 px-4">الإعلان</th>
                      <th className="py-3 px-4 whitespace-nowrap">السعر</th>
                      <th className="py-3 px-4 whitespace-nowrap">الحالة</th>
                      <th className="py-3 px-4 whitespace-nowrap">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-sm">
                    {myListings.map((item) => {
                      const statusMeta = getListingStatusBadge(item.status);
                      const StatusIcon = statusMeta.Icon;
                      const breed = breeds.find((b) => b.id === item.breedId);
                      const thumbUrl = item.images[0]?.url || breed?.imageUrl;

                      return (
                        <tr key={item.id} className="hover:bg-[var(--color-cream)]/30">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-12 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-cream)] shrink-0">
                                <SafeImage
                                  src={thumbUrl}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => onSelectListing(item)}
                                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer"
                                >
                                  {item.title}
                                </button>
                                <p className="text-[11px] text-[var(--color-muted)] tabular-nums mt-0.5">
                                  {breed?.name || 'حلال'} · {item.city} · {item.quantity} رأس
                                </p>
                                {item.rejectionReason && (
                                  <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                                    سبب الرفض: {item.rejectionReason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-[var(--color-green-ink)] tabular-nums whitespace-nowrap">
                            <div>{formatPriceSar(item.priceAmount)}</div>
                            {item.quantity > 1 && (
                              <p className="text-[11px] font-medium text-[var(--color-muted)] mt-0.5">
                                الإجمالي: {formatPriceSar(item.priceAmount * item.quantity)}
                              </p>
                            )}
                            {item.expectedPrice && (
                              <p className="text-[11px] font-medium text-[var(--color-muted)] mt-0.5">
                                المتوقع: {formatPriceSar(item.expectedPrice)}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-semibold ${statusMeta.cls}`}
                            >
                              <StatusIcon size={13} aria-hidden="true" />
                              <span>{statusMeta.label}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onEditListing(item)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil size={13} aria-hidden="true" />
                                <span>
                                  {item.status === 'Rejected' ||
                                  item.status === 'Draft' ||
                                  item.status === 'Expired'
                                    ? 'تعديل وإعادة إرسال'
                                    : 'تعديل'}
                                </span>
                              </button>
                              {item.status === 'Published' && (
                                <button
                                  type="button"
                                  onClick={() => onMarkSold(item.id)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] cursor-pointer"
                                >
                                  تحديد كمباع
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Price Offers / Negotiation Activity */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                عروض الأسعار والتفاوض (السوم) ({myOffers.length})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                متابعة عروض الأسعار الواردة على إعلاناتك أو العروض التي أرسلتها للمربين
              </p>
            </div>

            {myOffers.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                لا توجد عروض أسعار مسجلة لهذا الحساب حالياً.
              </p>
            ) : (
              <>
                {/* Mobile Offer Cards (< 768px) */}
                <div className="md:hidden space-y-3">
                  {myOffers.map((offer) => {
                    const listing = allListings.find((l) => l.id === offer.listingId);
                    const canRespond =
                      offer.status === 'pending' &&
                      (offer.sellerId === currentUser.id || currentUser.role === 'admin');
                    const totalOfferValue = offer.offeredPrice * offer.quantity;
                    const badgeCls =
                      offer.status === 'accepted'
                        ? 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25'
                        : offer.status === 'rejected'
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60'
                        : 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/35';

                    return (
                      <article
                        key={offer.id}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          {listing ? (
                            <button
                              type="button"
                              onClick={() => onSelectListing(listing)}
                              className="font-semibold text-xs text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer break-words min-w-0 flex-1"
                            >
                              {listing.title}
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--color-muted)]">{offer.listingId}</span>
                          )}
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-bold ${badgeCls}`}
                          >
                            {offer.status === 'accepted'
                              ? 'مقبول'
                              : offer.status === 'rejected'
                              ? 'مرفوض'
                              : 'بانتظار الرد'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-[var(--color-muted)]">المشتري: {offer.buyerName}</span>
                          <div className="text-left tabular-nums">
                            <span className="font-bold text-[var(--color-green-ink)]">
                              {formatPriceSar(offer.offeredPrice)} × {offer.quantity}
                            </span>
                            {offer.quantity > 1 && (
                              <span className="text-[11px] text-[var(--color-muted)] mr-1.5">
                                ({formatPriceSar(totalOfferValue)})
                              </span>
                            )}
                          </div>
                        </div>

                        {offer.note && (
                          <p className="text-xs text-[var(--color-muted)] break-words">{offer.note}</p>
                        )}

                        {canRespond && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => onRespondToOffer(offer.id, 'accepted')}
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                            >
                              قبول
                            </button>
                            <button
                              type="button"
                              onClick={() => onRespondToOffer(offer.id, 'rejected')}
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                            >
                              رفض
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                {/* Desktop / Tablet Offers Table (768px+) */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
                  <table className="w-full text-right text-sm border-collapse">
                    <thead>
                      <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                        <th className="py-2.5 px-3">الإعلان</th>
                        <th className="py-2.5 px-3">المشتري</th>
                        <th className="py-2.5 px-3">العرض المقدم</th>
                        <th className="py-2.5 px-3">الحالة</th>
                        <th className="py-2.5 px-3 text-left">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {myOffers.map((offer) => {
                        const listing = allListings.find((l) => l.id === offer.listingId);
                        const canRespond =
                          offer.status === 'pending' &&
                          (offer.sellerId === currentUser.id || currentUser.role === 'admin');
                        const totalOfferValue = offer.offeredPrice * offer.quantity;
                        const badgeCls =
                          offer.status === 'accepted'
                            ? 'bg-[var(--color-green)]/10 text-[var(--color-green-ink)] border-[var(--color-green-ink)]/25'
                            : offer.status === 'rejected'
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60'
                            : 'bg-[var(--color-gold-soft)] text-[var(--color-ink)] border-[var(--color-gold)]/35';

                        return (
                          <tr key={offer.id} className="hover:bg-[var(--color-cream)]/30">
                            <td className="py-3 px-3">
                              {listing ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectListing(listing)}
                                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer"
                                >
                                  {listing.title}
                                </button>
                              ) : (
                                <span className="text-[var(--color-muted)]">{offer.listingId}</span>
                              )}
                              {offer.note && (
                                <p className="text-xs text-[var(--color-muted)] mt-0.5">{offer.note}</p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-xs text-[var(--color-ink)] whitespace-nowrap">
                              {offer.buyerName}
                            </td>
                            <td className="py-3 px-3 font-bold text-[var(--color-green-ink)] tabular-nums whitespace-nowrap">
                              <div>{formatPriceSar(offer.offeredPrice)} × {offer.quantity}</div>
                              {offer.quantity > 1 && (
                                <p className="text-[11px] font-medium text-[var(--color-muted)] mt-0.5">
                                  الإجمالي: {formatPriceSar(totalOfferValue)}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-xs font-semibold whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md border ${badgeCls}`}>
                                {offer.status === 'accepted'
                                  ? 'مقبول'
                                  : offer.status === 'rejected'
                                  ? 'مرفوض'
                                  : 'بانتظار الرد'}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {canRespond && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onRespondToOffer(offer.id, 'accepted')}
                                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                                  >
                                    قبول
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRespondToOffer(offer.id, 'rejected')}
                                    className="min-h-[36px] px-3 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                                  >
                                    رفض
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Favorites */}
      {activeTab === 'favorites' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                الإعلانات المحفوظة في المفضلة ({favoriteListings.length})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                قائمة خاصة بالإعلانات التي حفظتها للمقارنة والمتابعة السريعة.
              </p>
            </div>
          </div>

          {favoriteListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center mx-auto">
                <Heart size={22} aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                  قائمة المفضلة فارغة حالياً
                </p>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  احفظ الإعلانات التي تهمك بالضغط على أيقونة القلب لتتمكن من مقارنتها والرجوع إليها بسهولة في أي وقت.
                </p>
              </div>
              {onBrowseListings && (
                <button
                  type="button"
                  onClick={onBrowseListings}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Search size={15} aria-hidden="true" />
                  <span>تصفح الإعلانات المتاحة</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoriteListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  category={categories.find((c) => c.id === listing.categoryId)}
                  breed={breeds.find((b) => b.id === listing.breedId)}
                  subCategory={categories.find((c) => c.id === listing.subCategoryId)}
                  region={regions.find((r) => r.id === listing.regionId)}
                  seller={sellers.find((s) => s.userId === listing.sellerId)}
                  isFavorite={true}
                  isLiked={likedListingIds.includes(listing.id)}
                  onSelect={onSelectListing}
                  onSelectSeller={onSelectSeller}
                  onToggleFavorite={onToggleFavorite}
                  onToggleLike={onToggleLike}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2b: Liked Listings (Separate from Saved Favorites) */}
      {activeTab === 'likes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                الإعلانات التي أعجبتك ({likedListings.length})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                سجل تفاعلات الإعجاب العامة على الإعلانات المنشورة، بشكل منفصل عن قائمة المفضلة الخاصة بك.
              </p>
            </div>
          </div>

          {likedListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-gold)] flex items-center justify-center mx-auto">
                <ThumbsUp size={22} aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                  لم تسجل إعجاباً بأي إعلان بعد
                </p>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  اضغط على زر «إعجاب» في أي إعلان منشور لدعم المربي وإضافة الإعلان إلى قائمتك هنا.
                </p>
              </div>
              {onBrowseListings && (
                <button
                  type="button"
                  onClick={onBrowseListings}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Search size={15} aria-hidden="true" />
                  <span>استعراض الإعلانات</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {likedListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  category={categories.find((c) => c.id === listing.categoryId)}
                  breed={breeds.find((b) => b.id === listing.breedId)}
                  subCategory={categories.find((c) => c.id === listing.subCategoryId)}
                  region={regions.find((r) => r.id === listing.regionId)}
                  seller={sellers.find((s) => s.userId === listing.sellerId)}
                  isFavorite={favoriteIds.includes(listing.id)}
                  isLiked={true}
                  onSelect={onSelectListing}
                  onSelectSeller={onSelectSeller}
                  onToggleFavorite={onToggleFavorite}
                  onToggleLike={onToggleLike}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Conversations (Responsive Switcher, Participant Previews, Unread Badges, Auto-Scroll) */}
      {activeTab === 'messages' && (
        conversations.length === 0 ? (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 sm:p-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-green-ink)] flex items-center justify-center mx-auto">
              <MessageSquare size={22} aria-hidden="true" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                لا توجد محادثات في بريدك حتى الآن
              </p>
              <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                يمكنك بدء محادثة مباشرة وخاصة مع أي مربي من صفحة تفاصيل الإعلان للاستفسار عن الحلال أو التفاوض على السعر.
              </p>
            </div>
            {onBrowseListings && (
              <button
                type="button"
                onClick={onBrowseListings}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Search size={15} aria-hidden="true" />
                <span>تصفح الإعلانات والتواصل مع المربين</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden min-h-[460px]">
            {/* Conversation List Pane (Hidden on mobile when a thread is open) */}
            <div
              aria-label="قائمة المحادثات"
              className={`lg:col-span-4 lg:border-l border-[var(--color-border)] bg-[var(--color-cream)]/35 divide-y divide-[var(--color-border)] flex-col max-h-[560px] overflow-y-auto ${
                mobileThreadOpen ? 'hidden lg:flex' : 'flex'
              }`}
            >
              <div className="px-4 py-3 bg-[var(--color-cream)] border-b border-[var(--color-border)] flex items-center justify-between gap-2">
                <span className="font-display text-xs font-bold text-[var(--color-ink)]">
                  المحادثات النشطة ({conversations.length})
                </span>
                {totalUnreadMessages > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[var(--color-gold-soft)] text-[var(--color-ink)] text-[11px] font-bold tabular-nums">
                    {totalUnreadMessages} غير مقروء
                  </span>
                )}
              </div>

              {conversations.map((conv) => {
                const meta = resolveConversationMeta(conv);
                const selected = activeConv?.id === conv.id;
                const lastMessage = conv.messages[conv.messages.length - 1];
                const initialChar = meta.otherParticipantName.trim().charAt(0) || 'م';

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => handleSelectConversation(conv)}
                    aria-current={selected ? 'true' : undefined}
                    className={`w-full text-right p-3.5 sm:p-4 transition-colors cursor-pointer flex items-start gap-3 min-h-[76px] ${
                      selected
                        ? 'bg-[var(--color-surface)] ring-1 ring-inset ring-[var(--color-green-ink)]/35'
                        : 'hover:bg-[var(--color-surface)]/75'
                    }`}
                  >
                    <div
                      aria-hidden="true"
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm shrink-0 border ${
                        selected
                          ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                          : 'bg-[var(--color-surface)] text-[var(--color-green-ink)] border-[var(--color-border)]'
                      }`}
                    >
                      {initialChar}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-[var(--color-ink)] truncate">
                          {meta.otherParticipantName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {meta.unreadCount > 0 && (
                            <span
                              aria-label={`${meta.unreadCount} رسائل غير مقروءة`}
                              className="min-w-[20px] h-5 px-1.5 rounded-md bg-[var(--color-gold)] text-[#14261D] text-[11px] font-extrabold tabular-nums inline-flex items-center justify-center"
                            >
                              {meta.unreadCount}
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--color-muted)] whitespace-nowrap tabular-nums">
                            {formatRelativeArabicTime(conv.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs font-semibold text-[var(--color-green-ink)] truncate">
                        {meta.listingTitle}
                      </p>

                      <p className="text-xs text-[var(--color-muted)] truncate">
                        {lastMessage?.body || 'بدء المحادثة'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Chat Thread Pane (On mobile, shown only when mobileThreadOpen is true) */}
            <div
              className={`lg:col-span-8 flex-col justify-between min-w-0 ${
                mobileThreadOpen ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {activeConv ? (
                (() => {
                  const activeMeta = resolveConversationMeta(activeConv);
                  const activeInitial = activeMeta.otherParticipantName.trim().charAt(0) || 'م';

                  return (
                    <>
                      <div className="p-3.5 sm:p-4 border-b border-[var(--color-border)] bg-[var(--color-cream)]/40 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setMobileThreadOpen(false)}
                            aria-label="العودة إلى قائمة المحادثات"
                            className="lg:hidden min-w-[44px] min-h-[44px] px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                          >
                            <ArrowRight size={15} aria-hidden="true" />
                            <span>المحادثات</span>
                          </button>

                          <div
                            aria-hidden="true"
                            className="hidden sm:flex w-10 h-10 rounded-xl bg-[var(--color-green)] text-white items-center justify-center font-display font-bold text-sm shrink-0"
                          >
                            {activeInitial}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-display text-sm sm:text-base font-bold text-[var(--color-ink)] truncate">
                              {activeMeta.otherParticipantName}
                            </p>
                            <p className="text-xs text-[var(--color-muted)] truncate">
                              {activeMeta.listing ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectListing(activeMeta.listing!)}
                                  className="text-[var(--color-green-ink)] hover:underline font-semibold text-right truncate max-w-full cursor-pointer"
                                >
                                  {activeMeta.listingTitle}
                                </button>
                              ) : (
                                activeMeta.listingTitle
                              )}
                            </p>
                          </div>
                        </div>

                        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-muted)] shrink-0">
                          <Lock size={12} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                          <span>مراسلة آمنة داخل المنصة</span>
                        </span>
                      </div>

                      <div
                        ref={messagesContainerRef}
                        className="p-3.5 sm:p-5 space-y-3.5 flex-1 overflow-y-auto max-h-[380px] min-h-[280px] bg-[var(--color-canvas)]/40"
                      >
                        {activeConv.messages.map((msg) => {
                          const isMine = msg.senderId === currentUser.id;
                          return (
                            <div
                              key={msg.id}
                              className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
                            >
                              <div
                                className={`max-w-[85%] sm:max-w-md rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-xs ${
                                  isMine
                                    ? 'bg-[var(--color-green)] text-white rounded-tr-sm'
                                    : 'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border)] rounded-tl-sm'
                                }`}
                              >
                                <p>{msg.body}</p>
                              </div>
                              <span className="text-[11px] text-[var(--color-muted)] mt-1 tabular-nums">
                                {formatRelativeArabicTime(msg.createdAt)}
                              </span>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} aria-hidden="true" />
                      </div>

                      <form
                        onSubmit={handleReplySubmit}
                        className="p-3 sm:p-4 border-t border-[var(--color-border)] flex items-center gap-2 bg-[var(--color-surface)]"
                      >
                        <label htmlFor="chat-reply-input" className="sr-only">
                          نص الرسالة
                        </label>
                        <input
                          id="chat-reply-input"
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="اكتب رسالتك هنا..."
                          className="flex-1 min-w-0 h-11 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/30 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)] focus:bg-[var(--color-surface)] transition-colors"
                        />
                        <button
                          type="submit"
                          disabled={sendingReply || !replyText.trim()}
                          className="min-h-[44px] h-11 px-4 sm:px-5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
                        >
                          <Send size={15} aria-hidden="true" />
                          <span>{sendingReply ? 'جاري الإرسال...' : 'إرسال'}</span>
                        </button>
                      </form>
                    </>
                  );
                })()
              ) : (
                <div className="p-8 text-center text-sm text-[var(--color-muted)]">
                  اختر محادثة لعرض الرسائل أو أرسل استفساراً من أي صفحة إعلان.
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Tab 4: Dashboard Analytics (Strictly scoped to authenticated user's own listings & activity unless Admin) */}
      {activeTab === 'analytics' && (
        <Suspense fallback={<AnalyticsFallback />}>
          <DashboardAnalytics
            listings={scopedAnalytics.listings}
            offers={scopedAnalytics.offers}
            conversations={scopedAnalytics.conversations}
            regions={regions}
            isAdmin={currentUser.role === 'admin'}
            onAddListing={onAddListing}
          />
        </Suspense>
      )}

      {/* Tab 5: Admin Moderation Panel */}
      {activeTab === 'admin' && (
        <div className="space-y-8">
          {currentUser.role !== 'admin' ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center max-w-xl mx-auto">
              <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                لوحة الإشراف مخصصة لإدارة المنصة
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                إدارة المستخدمين وتوثيق المربين واعتماد الإعلانات ومعالجة البلاغات متاحة لحسابات المشرفين فقط.
              </p>
            </div>
          ) : (
            <Suspense fallback={<AdminPanelFallback />}>
              <AdminDashboardPanel
                currentUser={currentUser}
                allListings={allListings}
                categories={categories}
                breeds={breeds}
                regions={regions}
                sellers={sellers}
                auditLogs={auditLogs}
                onSelectListing={onSelectListing}
                onApproveListing={onApproveListing}
                onRejectListing={onRejectListing}
                onCreateBreed={onCreateBreed}
                onCreateSubCategory={onCreateSubCategory}
                onUpdateSubCategory={onUpdateSubCategory}
                onDeleteSubCategory={onDeleteSubCategory}
                onAutoCategorizeListings={onAutoCategorizeListings}
                onRefreshData={onRefreshData}
                onNotify={onNotify}
              />
            </Suspense>
          )}
        </div>
      )}
    </section>
  );
}
