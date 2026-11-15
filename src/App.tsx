import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, setCsrfToken } from './lib/api';
import type { AppNotification, BootstrapPayload, Listing } from './types/marketplace';
import { Header } from './components/Header';
import { HeroSearch, type QuickFilterValues } from './components/HeroSearch';
import {
  HomeBreedersSection,
  HomeBreedsSection,
  HomeCategoriesSection,
  HomeGuidesSection,
  HomeTrustSection,
} from './components/HomeSections';
import { ListingCard } from './components/ListingCard';
import {
  DEFAULT_DIRECTORY_FILTERS,
  type DirectoryFilters,
} from './lib/listing-search';
import { Footer } from './components/Footer';
import {
  partitionSellersByVerification,
  resolveRequestedListing,
  resolveRequestedSeller,
} from './lib/marketplace-helpers';
import {
  buildNotificationTargetRoute,
  createRoute,
  parseUrlToRoute,
  routesEqual,
  routeToUrl,
  type AppRoute,
  type AuthMode,
  type DashboardTab,
  type PageView,
} from './lib/router';

// Secondary pages are loaded on demand (code splitting). The components keep their named exports,
// so each lazy() maps the named export to the default shape React.lazy expects.
const ListingDetailView = lazy(() =>
  import('./components/ListingDetailView').then((m) => ({ default: m.ListingDetailView })),
);
const AddListingView = lazy(() =>
  import('./components/AddListingView').then((m) => ({ default: m.AddListingView })),
);
const BreedsAndPricesView = lazy(() =>
  import('./components/BreedsAndPricesView').then((m) => ({ default: m.BreedsAndPricesView })),
);
const BreedersAndGuidesView = lazy(() =>
  import('./components/BreedersAndGuidesView').then((m) => ({ default: m.BreedersAndGuidesView })),
);
const DashboardView = lazy(() =>
  import('./components/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const SellerProfileView = lazy(() =>
  import('./components/SellerProfileView').then((m) => ({ default: m.SellerProfileView })),
);
const AuthView = lazy(() => import('./components/AuthView').then((m) => ({ default: m.AuthView })));
const ListingsDirectory = lazy(() =>
  import('./components/ListingsDirectory').then((m) => ({ default: m.ListingsDirectory }))
);

function PageFallback() {
  return (
    <div className="py-24 text-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-muted)]">جاري التحميل...</p>
    </div>
  );
}

const DEFAULT_FILTERS: DirectoryFilters = DEFAULT_DIRECTORY_FILTERS;

function resolveInitialTheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  try {
    const saved = localStorage.getItem('souq-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // ignore storage access issues
  }
  return 'light';
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(resolveInitialTheme);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [publishedListings, setPublishedListings] = useState<Listing[]>([]);
  const [publishedListingsTotal, setPublishedListingsTotal] = useState<number>(0);
  const [listingsRefreshNonce, setListingsRefreshNonce] = useState<number>(0);
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const initialRoute = useMemo<AppRoute>(() => {
    if (typeof window === 'undefined') return createRoute({ page: 'home' });
    try {
      return parseUrlToRoute(window.location.pathname, window.location.search);
    } catch {
      return createRoute({ page: 'home' });
    }
  }, []);

  const [page, setPage] = useState<PageView>(initialRoute.page);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(initialRoute.listingId);
  const [editingListingId, setEditingListingId] = useState<string | null>(
    initialRoute.editingListingId
  );
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(initialRoute.sellerId);
  const [authMode, setAuthMode] = useState<AuthMode>(initialRoute.authMode);
  const [targetCommentId, setTargetCommentId] = useState<string | null>(initialRoute.commentId);
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTab | null>(
    initialRoute.dashboardTab
  );
  const [homeBreedFilter, setHomeBreedFilter] = useState<string>('all');
  const [filters, setFilters] = useState<DirectoryFilters>(() =>
    initialRoute.page === 'listings' ? initialRoute.listingFilters : DEFAULT_FILTERS
  );
  const [toast, setToast] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [commentRefreshMap, setCommentRefreshMap] = useState<Record<string, number>>({});
  const [dashboardRequestedTab, setDashboardRequestedTab] = useState<DashboardTab | null>(
    initialRoute.dashboardTab
  );
  const [dashboardRequestedConvId, setDashboardRequestedConvId] = useState<string | null>(
    initialRoute.conversationId
  );
  const [addFormDirty, setAddFormDirty] = useState(false);
  const [pendingAddLeaveRoute, setPendingAddLeaveRoute] = useState<AppRoute | null>(null);
  const postAuthRouteRef = useRef<AppRoute | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('souq-compare-ids');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string').slice(0, 4)
        : [];
    } catch {
      return [];
    }
  });
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('souq-compare-ids', JSON.stringify(compareIds));
    } catch {
      // ignore storage errors
    }
  }, [compareIds]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('souq-theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4500);
  }, []);

  const refreshActivityData = useCallback(async () => {
    try {
      const activity = await api.getActivitySnapshot();
      setBootstrap((prev) =>
        prev
          ? {
              ...prev,
              favoriteIds: activity.favoriteIds,
              likedListingIds: activity.likedListingIds,
              conversations: activity.conversations,
              priceOffers: activity.priceOffers,
              reports: activity.reports,
              auditLogs: activity.auditLogs,
            }
          : prev
      );
      setNotifications(activity.notifications || []);
    } catch {
      // Transient background refresh failure does not disrupt active UI state
    }
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const boot = await api.bootstrap();
      setCsrfToken(boot.csrfToken);
      setBootstrap(boot);
      setNotifications(boot.notifications || []);

      const pubRes = await api.getListings({ status: 'Published' });
      setPublishedListings(pubRes.listings);
      setPublishedListingsTotal(
        typeof pubRes.totalCount === 'number' ? pubRes.totalCount : pubRes.listings.length
      );
      setListingsRefreshNonce((n) => n + 1);

      // Load user/admin accessible listings across all pages & statuses without 50-item truncation
      if (!boot.currentUser) {
        // Visitor: public listings only.
        setAllListings(pubRes.listings);
      } else if (boot.currentUser.role === 'admin') {
        const adminRes = await api.getAllListingsPaginated({ includeAllStatuses: true });
        const merged = [...adminRes.listings];
        pubRes.listings.forEach((p) => {
          if (!merged.some((m) => m.id === p.id)) merged.push(p);
        });
        setAllListings(merged);
      } else {
        const mineRes = await api.getAllListingsPaginated({ sellerId: boot.currentUser.id });
        const merged = [...mineRes.listings];
        pubRes.listings.forEach((p) => {
          if (!merged.some((m) => m.id === p.id)) merged.push(p);
        });
        setAllListings(merged);
      }
      setError('');
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات المنصة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const currentUserId = bootstrap?.currentUser?.id;

  useEffect(() => {
    if (!currentUserId) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;
    let failedAttempts = 0;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // The server identifies the connection from the session cookie; nothing about identity is sent here.
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      socket = new WebSocket(wsUrl);

      socket.addEventListener('open', () => {
        failedAttempts = 0;
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          if (payload.type === 'notifications:init' || payload.type === 'notifications:updated') {
            if (Array.isArray(payload.notifications)) {
              setNotifications(payload.notifications);
            }
          } else if (payload.type === 'notification:new' && payload.notification) {
            const incoming = payload.notification as AppNotification;
            setNotifications((prev) => {
              if (prev.some((item) => item.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
            notify(incoming.title);
            if (
              incoming.listingId &&
              (incoming.type === 'new_comment' || incoming.type === 'comment_reply')
            ) {
              const targetListingId = incoming.listingId;
              setCommentRefreshMap((prev) => ({
                ...prev,
                [targetListingId]: (prev[targetListingId] || 0) + 1,
              }));
              refreshActivityData();
            } else if (
              incoming.type === 'listing_approved' ||
              incoming.type === 'listing_rejected' ||
              incoming.type === 'seller_verified' ||
              incoming.type === 'seller_verification_rejected'
            ) {
              loadAllData();
            } else if (incoming.type !== 'listing_liked') {
              refreshActivityData();
            }
          } else if (payload.type === 'listing:comments-updated' && payload.listingId) {
            const targetListingId = String(payload.listingId);
            setCommentRefreshMap((prev) => ({
              ...prev,
              [targetListingId]: (prev[targetListingId] || 0) + 1,
            }));
          } else if (
            payload.type === 'listing:likes-updated' &&
            payload.listingId &&
            typeof payload.likesCount === 'number'
          ) {
            const targetListingId = String(payload.listingId);
            const nextCount = payload.likesCount;
            setPublishedListings((prev) =>
              prev.map((item) =>
                item.id === targetListingId ? { ...item, likesCount: nextCount } : item
              )
            );
            setAllListings((prev) =>
              prev.map((item) =>
                item.id === targetListingId ? { ...item, likesCount: nextCount } : item
              )
            );
          } else if (payload.type === 'conversation:updated' || payload.type === 'offer:updated') {
            refreshActivityData();
          }
        } catch {
          // Ignore malformed WS payloads
        }
      });

      socket.addEventListener('close', (event) => {
        if (disposed) return;
        // 4401: the server ended our session. Repeated failures: the handshake is being refused (signed out).
        failedAttempts += 1;
        if (event.code === 4401) {
          loadAllData();
          return;
        }
        if (failedAttempts === 6) loadAllData(); // refresh auth state once; retries continue with backoff
        reconnectTimer = window.setTimeout(connect, Math.min(30_000, 2500 * failedAttempts));
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, [currentUserId, loadAllData, refreshActivityData, notify]);

  const applyRouteState = useCallback(
    (route: AppRoute, options: { skipDashboardHint?: boolean } = {}) => {
      setPage(route.page);
      setSelectedListingId(route.page === 'detail' ? route.listingId : null);
      setSelectedSellerId(route.page === 'seller' ? route.sellerId : null);
      setEditingListingId(route.page === 'add' ? route.editingListingId : null);
      setTargetCommentId(route.page === 'detail' ? route.commentId : null);
      setAuthMode(route.page === 'login' ? route.authMode : 'login');
      if (route.page === 'listings') {
        setFilters(route.listingFilters);
      }
      if (route.page === 'dashboard') {
        if (!options.skipDashboardHint) {
          setDashboardRequestedTab(route.dashboardTab);
          setDashboardRequestedConvId(route.conversationId);
        }
        setActiveDashboardTab(route.dashboardTab);
      } else {
        setDashboardRequestedTab(null);
        setDashboardRequestedConvId(null);
        setActiveDashboardTab(null);
      }
    },
    []
  );

  const applyRoute = useCallback(
    (
      nextRoute: AppRoute,
      options: {
        replace?: boolean;
        preserveScroll?: boolean;
        bypassUnsavedGuard?: boolean;
        skipDashboardHint?: boolean;
      } = {}
    ) => {
      if (
        !options.bypassUnsavedGuard &&
        page === 'add' &&
        addFormDirty &&
        (nextRoute.page !== 'add' || nextRoute.editingListingId !== editingListingId)
      ) {
        setPendingAddLeaveRoute(nextRoute);
        return;
      }
      applyRouteState(nextRoute, { skipDashboardHint: options.skipDashboardHint });
      if (typeof window !== 'undefined') {
        try {
          const nextUrl = routeToUrl(nextRoute);
          const currentUrl = `${window.location.pathname}${window.location.search}`;
          if (options.replace) {
            window.history.replaceState({ souqRoute: nextRoute }, '', nextUrl);
          } else if (nextUrl !== currentUrl) {
            window.history.pushState({ souqRoute: nextRoute }, '', nextUrl);
          }
        } catch {
          // Ignore history API restrictions
        }
        if (!options.preserveScroll && !nextRoute.commentId) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    },
    [addFormDirty, applyRouteState, editingListingId, page]
  );

  // Sync initial history state and handle browser Back/Forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!window.history.state?.souqRoute) {
        window.history.replaceState(
          { souqRoute: initialRoute },
          '',
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
      }
    } catch {
      // Ignore history API restrictions
    }

    const onPopState = (event: PopStateEvent) => {
      const fromState = event.state?.souqRoute as AppRoute | undefined;
      const next =
        fromState || parseUrlToRoute(window.location.pathname, window.location.search);
      setAddFormDirty(false);
      setPendingAddLeaveRoute(null);
      applyRouteState(next);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyRouteState, initialRoute]);

  const navigate = useCallback(
    (
      nextPage: PageView,
      options: {
        authMode?: AuthMode;
        dashboardTab?: DashboardTab;
        conversationId?: string | null;
        listingId?: string | null;
        sellerId?: string | null;
        editingListingId?: string | null;
        commentId?: string | null;
        listingFilters?: Partial<DirectoryFilters>;
        replace?: boolean;
        preserveScroll?: boolean;
        bypassUnsavedGuard?: boolean;
        skipDashboardHint?: boolean;
      } = {}
    ) => {
      const nextRoute = createRoute({
        page: nextPage,
        authMode: options.authMode ?? 'login',
        dashboardTab: options.dashboardTab ?? null,
        conversationId: options.conversationId ?? null,
        listingId: options.listingId ?? null,
        sellerId: options.sellerId ?? null,
        editingListingId: options.editingListingId ?? null,
        commentId: options.commentId ?? null,
        listingFilters:
          nextPage === 'listings' ? (options.listingFilters ?? DEFAULT_FILTERS) : undefined,
      });
      if (nextPage === 'listings') {
        setFilters(nextRoute.listingFilters);
      }
      applyRoute(nextRoute, {
        replace: options.replace,
        preserveScroll: options.preserveScroll,
        bypassUnsavedGuard: options.bypassUnsavedGuard,
        skipDashboardHint: options.skipDashboardHint,
      });
    },
    [applyRoute]
  );

  const currentRouteSnapshot = useCallback((): AppRoute => {
    return createRoute({
      page,
      listingId: selectedListingId,
      sellerId: selectedSellerId,
      editingListingId,
      dashboardTab: activeDashboardTab,
      conversationId: dashboardRequestedConvId,
      commentId: targetCommentId,
      authMode,
      listingFilters: page === 'listings' ? filters : undefined,
    });
  }, [
    page,
    selectedListingId,
    selectedSellerId,
    editingListingId,
    activeDashboardTab,
    dashboardRequestedConvId,
    targetCommentId,
    authMode,
    filters,
  ]);

  const requireAuth = useCallback(
    (mode: AuthMode = 'login') => {
      const current = currentRouteSnapshot();
      if (current.page !== 'login') {
        postAuthRouteRef.current = current;
      }
      navigate('login', { authMode: mode });
    },
    [currentRouteSnapshot, navigate]
  );

  const clearDashboardHint = useCallback(() => {
    setDashboardRequestedTab(null);
    setDashboardRequestedConvId(null);
  }, []);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch {
      // Optimistic local read state already applied
    }
  }, []);

  const handleOpenNotification = useCallback(
    async (item: AppNotification) => {
      if (!item.read) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
        );
        try {
          await api.markNotificationRead(item.id);
        } catch {
          // Keep optimistic read state
        }
      }

      const targetRoute = buildNotificationTargetRoute(item);
      applyRoute(targetRoute, { preserveScroll: Boolean(targetRoute.commentId) });
    },
    [applyRoute]
  );

  const handleHeroSearch = (quick: QuickFilterValues) => {
    navigate('listings', {
      listingFilters: {
        ...DEFAULT_FILTERS,
        q: quick.q,
        categoryId: quick.categoryId,
        breedId: quick.breedId,
        regionId: quick.regionId,
        maxPrice: quick.maxPrice,
      },
    });
  };

  const handleSelectListing = useCallback(
    (listing: Listing) => {
      navigate('detail', { listingId: listing.id });
    },
    [navigate]
  );

  const handleSelectSeller = useCallback(
    (sellerId: string) => {
      navigate('seller', { sellerId });
    },
    [navigate]
  );

  /** Sends visitors to the login page; throws so callers do not report success. */
  const ensureSignedIn = () => {
    if (!bootstrap?.currentUser) {
      requireAuth('login');
      throw new Error('سجّل الدخول للمتابعة');
    }
  };

  const handleToggleFavorite = async (listingId: string) => {
    if (!bootstrap) return;
    try {
      ensureSignedIn();
      const res = await api.toggleFavorite(listingId);
      setBootstrap({ ...bootstrap, favoriteIds: res.favoriteIds });
      notify(res.isFavorite ? 'تمت إضافة الإعلان إلى المفضلة' : 'تمت إزالة الإعلان من المفضلة');
    } catch (err: any) {
      notify(err?.message || 'تعذر تحديث المفضلة');
    }
  };

  const pendingLikesRef = useRef<Set<string>>(new Set());

  const handleToggleLike = async (listingId: string) => {
    if (!bootstrap) return;
    if (!bootstrap.currentUser) {
      requireAuth('login');
      notify('سجّل الدخول للإعجاب بالإعلانات');
      return;
    }
    if (pendingLikesRef.current.has(listingId)) return;

    const prevLikedIds = bootstrap.likedListingIds || [];
    const wasLiked = prevLikedIds.includes(listingId);
    const targetAction = wasLiked ? 'unlike' : 'like';
    const delta = wasLiked ? -1 : 1;

    const existingListing =
      publishedListings.find((item) => item.id === listingId) ||
      allListings.find((item) => item.id === listingId);
    const prevLikesCount = existingListing?.likesCount ?? 0;

    const nextOptimisticLikedIds = wasLiked
      ? prevLikedIds.filter((id) => id !== listingId)
      : [...prevLikedIds, listingId];

    const patchLikesCount = (items: Listing[]) =>
      items.map((item) =>
        item.id === listingId
          ? { ...item, likesCount: Math.max(0, (item.likesCount ?? 0) + delta) }
          : item
      );

    // Apply optimistic update immediately
    setBootstrap((prev) => (prev ? { ...prev, likedListingIds: nextOptimisticLikedIds } : prev));
    setPublishedListings(patchLikesCount);
    setAllListings(patchLikesCount);
    pendingLikesRef.current.add(listingId);

    try {
      const res = await api.setListingLike(listingId, targetAction);
      setBootstrap((prev) => (prev ? { ...prev, likedListingIds: res.likedListingIds } : prev));
      setPublishedListings((prev) =>
        prev.map((item) => (item.id === listingId ? { ...item, likesCount: res.likesCount } : item))
      );
      setAllListings((prev) =>
        prev.map((item) => (item.id === listingId ? { ...item, likesCount: res.likesCount } : item))
      );
    } catch (err: any) {
      // Roll back optimistic state cleanly on failure
      setBootstrap((prev) => (prev ? { ...prev, likedListingIds: prevLikedIds } : prev));
      setPublishedListings((prev) =>
        prev.map((item) =>
          item.id === listingId ? { ...item, likesCount: prevLikesCount } : item
        )
      );
      setAllListings((prev) =>
        prev.map((item) =>
          item.id === listingId ? { ...item, likesCount: prevLikesCount } : item
        )
      );
      notify(err?.message || 'تعذر تحديث الإعجاب، تم التراجع عن التغيير');
    } finally {
      pendingLikesRef.current.delete(listingId);
    }
  };

  const handleCreateListing = async (payload: Record<string, unknown>) => {
    const res = await api.createListing(payload);
    setAddFormDirty(false);
    setPendingAddLeaveRoute(null);
    await loadAllData();
    if (res.listing.status === 'Draft') {
      notify('تم حفظ الإعلان كمسودة في لوحة حسابي');
      navigate('dashboard', { dashboardTab: 'my-listings', bypassUnsavedGuard: true });
    } else if (res.listing.status === 'Pending') {
      notify('تم إرسال الإعلان للمراجعة الإدارية، ويمكنك متابعته من لوحة حسابي');
      navigate('dashboard', { dashboardTab: 'my-listings', bypassUnsavedGuard: true });
    } else {
      notify('تم نشر الإعلان بنجاح');
      navigate('detail', { listingId: res.listing.id, bypassUnsavedGuard: true });
    }
  };

  const handleStartEditListing = (listing: Listing) => {
    navigate('add', { editingListingId: listing.id });
  };

  const handleUpdateListing = async (listingId: string, payload: Record<string, unknown>) => {
    const res = await api.updateListing(listingId, payload);
    setAddFormDirty(false);
    setPendingAddLeaveRoute(null);
    await loadAllData();
    if (res.listing.status === 'Pending') {
      notify('تم حفظ التعديلات وإرسال الإعلان للمراجعة الإدارية قبل النشر');
    } else if (res.listing.status === 'Draft') {
      notify('تم حفظ الإعلان كمسودة بنجاح');
    } else {
      notify('تم حفظ تعديلات الإعلان بنجاح');
    }
    navigate('detail', { listingId: res.listing.id, bypassUnsavedGuard: true });
  };

  /**
   * Conversation actions: a failure is always shown to the user (toast) and then re-thrown, so the calling
   * form can show its own inline error and keep the typed text. Success is only reported after the server
   * accepted the message; a failed refresh afterwards does not turn a delivered message into an "error".
   */
  const handleStartConversation = async (listingId: string, initialMessage: string) => {
    let createdConvId = '';
    try {
      ensureSignedIn();
      const res = await api.startConversation(listingId, initialMessage);
      createdConvId = res.conversation.id;
    } catch (err: any) {
      notify(err?.message || 'تعذر إرسال رسالتك إلى البائع، حاول مرة أخرى');
      throw err;
    }
    if (createdConvId && initialMessage.trim()) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.type === 'new_message' && n.conversationId === createdConvId && !n.read
            ? { ...n, read: true }
            : n
        )
      );
    }
    await refreshActivityData();
    notify('تم إرسال رسالتك إلى البائع');
  };

  const handleSendMessage = async (conversationId: string, body: string) => {
    try {
      await api.sendMessage(conversationId, body);
    } catch (err: any) {
      notify(err?.message || 'تعذر إرسال الرسالة، حاول مرة أخرى');
      throw err;
    }
    setNotifications((prev) =>
      prev.map((n) =>
        n.type === 'new_message' && n.conversationId === conversationId && !n.read
          ? { ...n, read: true }
          : n
      )
    );
    await refreshActivityData();
  };

  const handleMarkConversationRead = useCallback(async (conversationId: string) => {
    try {
      const res = await api.markConversationRead(conversationId);
      setBootstrap((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          conversations: prev.conversations.map((conv) =>
            conv.id === conversationId ? res.conversation : conv
          ),
        };
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.type === 'new_message' && n.conversationId === conversationId && !n.read
            ? { ...n, read: true }
            : n
        )
      );
    } catch {
      // Retry automatically on next render/focus if transient error occurs
    }
  }, []);

  const handleSubmitPriceOffer = async (
    listingId: string,
    payload: { offeredPrice: number; quantity: number; note: string }
  ) => {
    ensureSignedIn();
    await api.submitPriceOffer(listingId, payload);
    await refreshActivityData();
    notify('تم إرسال عرض السعر إلى المربي بنجاح');
  };

  const handleRespondToOffer = async (offerId: string, status: 'accepted' | 'rejected') => {
    await api.respondToOffer(offerId, status);
    await refreshActivityData();
    notify(status === 'accepted' ? 'تم قبول عرض السعر' : 'تم رفض عرض السعر');
  };

  const handleReportListing = async (listingId: string, reason: string, details: string) => {
    ensureSignedIn();
    await api.createReport(listingId, reason, details);
    await refreshActivityData();
  };

  const finishPostAuthNavigation = () => {
    const pendingRoute = postAuthRouteRef.current;
    postAuthRouteRef.current = null;
    if (page === 'login') {
      if (pendingRoute && !routesEqual(pendingRoute, createRoute({ page: 'login' }))) {
        applyRoute(pendingRoute, { replace: true });
      } else {
        navigate('home', { replace: true });
      }
    }
  };

  const handleLogin = async (phone: string, password: string) => {
    const res = await api.login({ phone, password });
    setCsrfToken(res.csrfToken);
    await loadAllData();
    notify(`مرحباً ${res.user.name}`);
    finishPostAuthNavigation();
  };

  const handleRegister = async (
    name: string,
    phone: string,
    password: string,
    role: 'buyer' | 'seller'
  ) => {
    const res = await api.register({ name, phone, password, role });
    setCsrfToken(res.csrfToken);
    await loadAllData();
    notify(`مرحباً ${res.user.name}، تم تفعيل حسابك بنجاح`);
    finishPostAuthNavigation();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Even if the request fails the local view is reset; the server session expires on its own.
    }
    setCsrfToken(null);
    setNotifications([]);
    clearDashboardHint();
    await loadAllData();
    navigate('home');
    notify('تم تسجيل الخروج');
  };

  // The server ended our session (expiry/revocation): fall back to the signed-out view.
  useEffect(() => {
    const onUnauthenticated = () => {
      setCsrfToken(null);
      loadAllData();
    };
    window.addEventListener('souq:unauthenticated', onUnauthenticated);
    return () => window.removeEventListener('souq:unauthenticated', onUnauthenticated);
  }, [loadAllData]);

  const handleApproveListing = async (listingId: string) => {
    await api.approveListing(listingId);
    await loadAllData();
    notify('تم اعتماد الإعلان ونشره في السوق');
  };

  const handleRejectListing = async (listingId: string, reason: string) => {
    await api.rejectListing(listingId, reason);
    await loadAllData();
    notify('تم رفض الإعلان وتوثيق السبب');
  };

  const handleMarkSold = async (listingId: string) => {
    await api.updateListing(listingId, { status: 'Sold' });
    await loadAllData();
    notify('تم تحديث حالة الإعلان إلى مباع');
  };

  const handleSubmitSellerReview = async (
    sellerId: string,
    payload: { rating: number; comment: string }
  ) => {
    ensureSignedIn();
    const res = await api.submitSellerReview(sellerId, payload);
    setBootstrap((prev) =>
      prev
        ? {
            ...prev,
            sellers: prev.sellers.map((s) => (s.userId === sellerId ? res.seller : s)),
          }
        : prev
    );
    notify('تم حفظ تقييمك للمربي بنجاح');
  };

  const handleCreateBreed = async (payload: {
    name: string;
    categoryId: string;
    origin: string;
    summary: string;
    avgWeightKg: string;
    priceRangeSar: string;
  }) => {
    await api.createBreed(payload);
    await loadAllData();
    notify('تمت إضافة السلالة الجديدة إلى قاعدة البيانات');
  };

  const handleCreateSubCategory = async (payload: {
    name: string;
    parentId: string;
    description: string;
    keywords: string;
  }) => {
    await api.createSubCategory(payload);
    await loadAllData();
    notify(`تم إنشاء الفئة الفرعية «${payload.name}» بنجاح`);
  };

  const handleUpdateSubCategory = async (
    id: string,
    payload: {
      name: string;
      parentId: string;
      description: string;
      keywords: string;
    }
  ) => {
    await api.updateSubCategory(id, payload);
    await loadAllData();
    notify(`تم تحديث الفئة الفرعية «${payload.name}»`);
  };

  const handleDeleteSubCategory = async (id: string) => {
    await api.deleteSubCategory(id);
    await loadAllData();
    notify('تم حذف الفئة الفرعية وإعادة توزيع الإعلانات');
  };

  const handleAutoCategorizeListings = async (
    payload: { listingId?: string; subCategoryId?: string } = {}
  ) => {
    const res = await api.autoCategorizeListings(payload);
    await loadAllData();
    notify(
      payload.listingId
        ? 'تم تحديث الفئة الفرعية للإعلان'
        : `تم تصنيف ${res.updatedCount} إعلان تلقائياً`
    );
  };

  const homeListings = useMemo(() => {
    const base =
      homeBreedFilter === 'all'
        ? publishedListings
        : publishedListings.filter((l) => l.breedId === homeBreedFilter);
    return base.slice(0, 6);
  }, [publishedListings, homeBreedFilter]);

  const selectedListing = useMemo(
    () =>
      resolveRequestedListing({
        listingId: selectedListingId,
        allListings,
        publishedListings,
      }),
    [allListings, publishedListings, selectedListingId]
  );

  const editingListing = useMemo(
    () => (editingListingId ? allListings.find((l) => l.id === editingListingId) || null : null),
    [allListings, editingListingId]
  );

  const handleToggleCompare = useCallback(
    (listingId: string) => {
      setCompareIds((prev) => {
        if (prev.includes(listingId)) {
          notify('تمت إزالة الإعلان من قائمة المقارنة');
          return prev.filter((id) => id !== listingId);
        }
        if (prev.length >= 4) {
          notify('يمكنك مقارنة 4 إعلانات كحد أقصى في الوقت نفسه');
          return prev;
        }
        notify(`تمت إضافة الإعلان إلى قائمة المقارنة (${prev.length + 1}/4)`);
        return [...prev, listingId];
      });
    },
    [notify]
  );

  const handleClearCompare = useCallback(() => {
    setCompareIds([]);
    notify('تم مسح قائمة مقارنة المواشي');
  }, [notify]);

  const compareListings = useMemo(() => {
    const pool = [...allListings];
    publishedListings.forEach((p) => {
      if (!pool.some((item) => item.id === p.id)) pool.push(p);
    });
    return compareIds
      .map((id) => pool.find((l) => l.id === id))
      .filter((item): item is Listing => Boolean(item));
  }, [compareIds, allListings, publishedListings]);

  const selectedSeller = useMemo(
    () =>
      resolveRequestedSeller({
        sellerId: selectedSellerId,
        sellers: bootstrap?.sellers || [],
      }),
    [bootstrap, selectedSellerId]
  );

  const { verifiedSellers: verifiedHomeSellers, otherSellers: otherHomeSellers } = useMemo(
    () => partitionSellersByVerification(bootstrap?.sellers || []),
    [bootstrap]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-display text-2xl font-extrabold text-[var(--color-green-ink)]">
            سوق الغنم
          </p>
          <p className="text-sm text-[var(--color-muted)]">جاري تحميل المنصة...</p>
        </div>
      </div>
    );
  }

  if (error || !bootstrap) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--color-cream)] border border-[var(--color-border)] rounded-xl p-6 text-center">
          <p className="font-display text-lg font-bold text-[var(--color-ink)]">
            تعذر تحميل البيانات
          </p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{error}</p>
          <button
            type="button"
            onClick={loadAllData}
            className="mt-4 px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)] text-[var(--color-ink)] transition-colors">
      <Header
        currentPage={page}
        activeDashboardTab={activeDashboardTab}
        onNavigate={navigate}
        currentUser={bootstrap.currentUser}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        notifications={notifications}
        onOpenNotification={handleOpenNotification}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-5 z-50 bg-[var(--color-green)] text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium border border-[var(--color-gold)]/50"
        >
          {toast}
        </div>
      )}

      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
        {/* HOME PAGE */}
        {page === 'home' && (
          <>
            <HeroSearch
              categories={bootstrap.categories}
              breeds={bootstrap.breeds}
              regions={bootstrap.regions}
              onSearch={handleHeroSearch}
              onBrowseAll={() => {
                navigate('listings', { listingFilters: DEFAULT_FILTERS });
              }}
              onAddListing={() => navigate('add')}
            />

            {/* Section 1: Livestock Categories & Purpose */}
            <HomeCategoriesSection
              categories={bootstrap.categories}
              publishedListings={publishedListings}
              onFilterListings={(patch) => {
                navigate('listings', { listingFilters: { ...DEFAULT_FILTERS, ...patch } });
              }}
              onBrowseAll={() => {
                navigate('listings', { listingFilters: DEFAULT_FILTERS });
              }}
            />

            {/* Section 2: Featured & Latest Listings */}
            <section
              aria-labelledby="home-latest-listings-heading"
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[var(--color-border)]">
                <div>
                  <h2
                    id="home-latest-listings-heading"
                    className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
                  >
                    أحدث إعلانات المواشي المختارة
                  </h2>
                  <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                    عروض محدثة بمواصفات العمر والوزن والتحصين والسعر الواضح بالريال السعودي
                  </p>
                </div>

                {/* Breed Quick Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--color-cream)] rounded-lg border border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => setHomeBreedFilter('all')}
                    className={`min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      homeBreedFilter === 'all'
                        ? 'bg-[var(--color-green)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    الكل
                  </button>
                  {bootstrap.breeds.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setHomeBreedFilter(b.id)}
                      className={`min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        homeBreedFilter === b.id
                          ? 'bg-[var(--color-green)] text-white'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>

              {homeListings.length === 0 ? (
                <div className="mt-8 bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-xl p-8 text-center space-y-3">
                  <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                    {homeBreedFilter !== 'all'
                      ? `لا توجد إعلانات منشورة حالياً لسلالة «${
                          bootstrap.breeds.find((b) => b.id === homeBreedFilter)?.name || 'المحددة'
                        }»`
                      : 'لا توجد إعلانات منشورة حالياً'}
                  </p>
                  <p className="text-sm text-[var(--color-muted)] max-w-xl mx-auto">
                    {homeBreedFilter !== 'all'
                      ? 'يمكنك عرض جميع السلالات أو استعراض دليل السلالات والأسعار الاسترشادية أو البحث في كامل السوق.'
                      : 'تحقق لاحقاً أو أضف إعلانك الأول في السوق.'}
                  </p>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    {homeBreedFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setHomeBreedFilter('all')}
                        className="min-h-[44px] px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer"
                      >
                        عرض جميع السلالات
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('breeds')}
                      className="min-h-[44px] px-5 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-[var(--color-ink)] text-sm font-semibold cursor-pointer"
                    >
                      دليل السلالات والأسعار
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('listings', { listingFilters: DEFAULT_FILTERS })}
                      className="min-h-[44px] px-5 py-2 rounded-lg border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white text-sm font-semibold cursor-pointer"
                    >
                      استعراض دليل الإعلانات
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {homeListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      category={bootstrap.categories.find((c) => c.id === listing.categoryId)}
                      breed={bootstrap.breeds.find((b) => b.id === listing.breedId)}
                      subCategory={bootstrap.categories.find((c) => c.id === listing.subCategoryId)}
                      region={bootstrap.regions.find((r) => r.id === listing.regionId)}
                      seller={bootstrap.sellers.find((s) => s.userId === listing.sellerId)}
                      isFavorite={bootstrap.favoriteIds.includes(listing.id)}
                      isLiked={(bootstrap.likedListingIds || []).includes(listing.id)}
                      onSelect={handleSelectListing}
                      onSelectSeller={handleSelectSeller}
                      onToggleFavorite={handleToggleFavorite}
                      onToggleLike={handleToggleLike}
                    />
                  ))}
                </div>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    navigate('listings', { listingFilters: DEFAULT_FILTERS });
                  }}
                  className="min-h-[44px] inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white hover:border-[var(--color-green)] text-sm font-semibold transition-colors cursor-pointer"
                >
                  <span>
                    عرض جميع الإعلانات ({publishedListingsTotal || publishedListings.length})
                  </span>
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
              </div>
            </section>

            {/* Section 3: Breed Directory & Indicative Prices Spotlight */}
            <HomeBreedsSection
              breeds={bootstrap.breeds}
              onFilterByBreed={(breedId) => {
                navigate('listings', {
                  listingFilters: { ...DEFAULT_FILTERS, breedId },
                });
              }}
              onOpenBreedsDirectory={() => navigate('breeds')}
            />

            {/* Section 4: Verified Breeders & Other Sellers */}
            <HomeBreedersSection
              verifiedSellers={verifiedHomeSellers}
              otherSellers={otherHomeSellers}
              onSelectSeller={handleSelectSeller}
              onOpenBreedersDirectory={() => navigate('breeders')}
            />

            {/* Section 5: Marketplace Safety & Trust Information */}
            <HomeTrustSection
              onOpenBreedersDirectory={() => navigate('breeders')}
              onAddListing={() => navigate('add')}
            />

            {/* Section 6: Educational Guides & Buyer/Breeder FAQs */}
            <HomeGuidesSection
              articles={bootstrap.articles}
              faqs={bootstrap.faqs}
              onOpenBreedersDirectory={() => navigate('breeders')}
            />
          </>
        )}

        {/* LISTINGS DIRECTORY */}
        {page === 'listings' && (
          <ListingsDirectory
            listings={publishedListings}
            categories={bootstrap.categories}
            breeds={bootstrap.breeds}
            regions={bootstrap.regions}
            sellers={bootstrap.sellers}
            favoriteIds={bootstrap.favoriteIds}
            likedListingIds={bootstrap.likedListingIds || []}
            filters={filters}
            isSignedIn={Boolean(bootstrap.currentUser)}
            isAdmin={bootstrap.currentUser?.role === 'admin'}
            refreshSignal={listingsRefreshNonce}
            onChangeFilters={(nextFilters) => {
              setFilters(nextFilters);
              applyRoute(createRoute({ page: 'listings', listingFilters: nextFilters }), {
                preserveScroll: true,
              });
            }}
            onResetFilters={() => {
              setFilters(DEFAULT_FILTERS);
              applyRoute(createRoute({ page: 'listings', listingFilters: DEFAULT_FILTERS }), {
                preserveScroll: true,
              });
            }}
            onSelectListing={handleSelectListing}
            onSelectSeller={handleSelectSeller}
            onToggleFavorite={handleToggleFavorite}
            onToggleLike={handleToggleLike}
          />
        )}

        {/* LISTING DETAIL */}
        {page === 'detail' && (
          selectedListing ? (
            <ListingDetailView
              key={selectedListing.id}
              listing={selectedListing}
              currentUser={bootstrap.currentUser}
              category={bootstrap.categories.find((c) => c.id === selectedListing.categoryId)}
              subCategory={bootstrap.categories.find((c) => c.id === selectedListing.subCategoryId)}
              breed={bootstrap.breeds.find((b) => b.id === selectedListing.breedId)}
              region={bootstrap.regions.find((r) => r.id === selectedListing.regionId)}
              seller={bootstrap.sellers.find((s) => s.userId === selectedListing.sellerId)}
              offers={bootstrap.priceOffers || []}
              isFavorite={bootstrap.favoriteIds.includes(selectedListing.id)}
              isLiked={(bootstrap.likedListingIds || []).includes(selectedListing.id)}
              favoriteIds={bootstrap.favoriteIds}
              likedListingIds={bootstrap.likedListingIds || []}
              onBack={() => navigate('listings', { listingFilters: filters })}
              onToggleFavorite={handleToggleFavorite}
              onToggleLike={handleToggleLike}
              onStartConversation={handleStartConversation}
              onSubmitPriceOffer={handleSubmitPriceOffer}
              onRespondToOffer={handleRespondToOffer}
              onReportListing={handleReportListing}
              onOpenSellerProfile={handleSelectSeller}
              onNotify={notify}
              comparableListings={publishedListings}
              allCategories={bootstrap.categories}
              allBreeds={bootstrap.breeds}
              allRegions={bootstrap.regions}
              allSellers={bootstrap.sellers}
              compareIds={compareIds}
              compareListings={compareListings}
              onToggleCompare={handleToggleCompare}
              onClearCompare={handleClearCompare}
              onSelectListing={handleSelectListing}
              onEditListing={handleStartEditListing}
              onMarkSold={handleMarkSold}
              commentRefreshSignal={commentRefreshMap[selectedListing.id] || 0}
              targetCommentId={targetCommentId}
              onRequireAuth={(mode) => requireAuth(mode)}
            />
          ) : (
            <section className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
              <div
                role="status"
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 text-center space-y-4 shadow-sm"
              >
                <div className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-gold)]">
                  إعلان غير متاح
                </div>
                <h1 className="font-display text-2xl font-extrabold text-[var(--color-ink)]">
                  الإعلان غير موجود أو غير متاح للعرض
                </h1>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  تعذر العثور على الإعلان المطلوب؛ قد يكون محذوفاً أو لم يُنشر بعد أو لا تملك صلاحية عرضه.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      navigate('listings', { listingFilters: DEFAULT_FILTERS });
                    }}
                    className="px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer"
                  >
                    تصفح الإعلانات المتاحة
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('home')}
                    className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-[var(--color-ink)] text-sm font-semibold cursor-pointer"
                  >
                    العودة للرئيسية
                  </button>
                  {!bootstrap.currentUser && (
                    <button
                      type="button"
                      onClick={() => requireAuth('login')}
                      className="px-5 py-2.5 rounded-lg border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] text-sm font-semibold cursor-pointer"
                    >
                      تسجيل الدخول
                    </button>
                  )}
                </div>
              </div>
            </section>
          )
        )}

        {/* LOGIN / REGISTER (also shown in place of pages that need an account) */}
        {!bootstrap.currentUser && (page === 'login' || page === 'add' || page === 'dashboard') && (
          <AuthView
            reason={
              page === 'login'
                ? undefined
                : 'سجّل الدخول أو أنشئ حساباً للمتابعة إلى هذه الصفحة.'
            }
            initialMode={page === 'login' ? authMode : 'login'}
            onModeChange={(nextMode) => {
              if (page === 'login') {
                navigate('login', { authMode: nextMode, preserveScroll: true });
              }
            }}
            onLogin={handleLogin}
            onRegister={handleRegister}
          />
        )}

        {/* ADD / EDIT LISTING */}
        {page === 'add' && bootstrap.currentUser && (
          <AddListingView
            key={editingListing?.id || 'new'}
            categories={bootstrap.categories}
            breeds={bootstrap.breeds}
            regions={bootstrap.regions}
            isAdmin={bootstrap.currentUser.role === 'admin'}
            editingListing={editingListing}
            onCreate={handleCreateListing}
            onUpdate={handleUpdateListing}
            onDirtyChange={setAddFormDirty}
            pendingExternalNavigation={Boolean(pendingAddLeaveRoute)}
            onCancelExternalNavigation={() => setPendingAddLeaveRoute(null)}
            onConfirmExternalNavigation={() => {
              const target = pendingAddLeaveRoute;
              setPendingAddLeaveRoute(null);
              setAddFormDirty(false);
              if (target) {
                applyRoute(target, { bypassUnsavedGuard: true });
              }
            }}
            onCancel={() => {
              setAddFormDirty(false);
              setPendingAddLeaveRoute(null);
              if (editingListing) {
                navigate('detail', { listingId: editingListing.id, bypassUnsavedGuard: true });
              } else {
                navigate('home', { bypassUnsavedGuard: true });
              }
            }}
          />
        )}

        {/* BREEDS & INDICATIVE PRICES */}
        {page === 'breeds' && (
          <BreedsAndPricesView
            breeds={bootstrap.breeds}
            categories={bootstrap.categories}
            indicativePrices={bootstrap.indicativePrices}
            onFilterByBreed={(breedId) => {
              navigate('listings', { listingFilters: { ...DEFAULT_FILTERS, breedId } });
            }}
          />
        )}

        {/* BREEDERS, ARTICLES & FAQ */}
        {page === 'breeders' && (
          <BreedersAndGuidesView
            sellers={bootstrap.sellers}
            articles={bootstrap.articles}
            faqs={bootstrap.faqs}
            indicativePrices={bootstrap.indicativePrices}
            onOpenSeller={handleSelectSeller}
          />
        )}

        {/* SELLER PROFILE */}
        {page === 'seller' && (
          selectedSeller ? (
            <SellerProfileView
              seller={selectedSeller}
              currentUser={bootstrap.currentUser}
              listings={publishedListings}
              categories={bootstrap.categories}
              breeds={bootstrap.breeds}
              regions={bootstrap.regions}
              favoriteIds={bootstrap.favoriteIds}
              likedListingIds={bootstrap.likedListingIds || []}
              onBack={() => navigate('breeders')}
              onSelectListing={handleSelectListing}
              onToggleFavorite={handleToggleFavorite}
              onToggleLike={handleToggleLike}
              onRequireAuth={(mode) => requireAuth(mode)}
              onSubmitReview={handleSubmitSellerReview}
            />
          ) : (
            <section className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
              <div
                role="status"
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 text-center space-y-4 shadow-sm"
              >
                <div className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-gold)]">
                  ملف مربي غير متاح
                </div>
                <h1 className="font-display text-2xl font-extrabold text-[var(--color-ink)]">
                  ملف المربي غير موجود أو غير متاح
                </h1>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  تعذر العثور على بيانات المربي المطلوب في الدليل العام حالياً، أو أن هذا الحساب لا يمتلك ملف مراح عام.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('breeders')}
                    className="px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer"
                  >
                    استعراض دليل المربين
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigate('listings', { listingFilters: DEFAULT_FILTERS });
                    }}
                    className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-[var(--color-ink)] text-sm font-semibold cursor-pointer"
                  >
                    تصفح الإعلانات
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('home')}
                    className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-ink)] text-sm font-semibold cursor-pointer"
                  >
                    العودة للرئيسية
                  </button>
                </div>
              </div>
            </section>
          )
        )}

        {/* ACCOUNT / DASHBOARD / MODERATION */}
        {page === 'dashboard' && bootstrap.currentUser && (
          <DashboardView
            requestedTab={dashboardRequestedTab}
            requestedConvId={dashboardRequestedConvId}
            onClearNavigationHint={clearDashboardHint}
            onTabChange={(tab, opts) => {
              setActiveDashboardTab(tab);
              applyRoute(
                createRoute({
                  page: 'dashboard',
                  dashboardTab: tab,
                  conversationId: tab === 'messages' ? (opts?.conversationId ?? null) : null,
                }),
                { preserveScroll: true, replace: opts?.replace, skipDashboardHint: true }
              );
            }}
            currentUser={bootstrap.currentUser}
            allListings={allListings}
            categories={bootstrap.categories}
            breeds={bootstrap.breeds}
            regions={bootstrap.regions}
            sellers={bootstrap.sellers}
            favoriteIds={bootstrap.favoriteIds}
            likedListingIds={bootstrap.likedListingIds || []}
            conversations={bootstrap.conversations}
            priceOffers={bootstrap.priceOffers || []}
            auditLogs={bootstrap.auditLogs}
            onLogout={handleLogout}
            onSelectListing={handleSelectListing}
            onSelectSeller={handleSelectSeller}
            onBrowseListings={() => {
              navigate('listings', { listingFilters: DEFAULT_FILTERS });
            }}
            onAddListing={() => navigate('add')}
            onEditListing={handleStartEditListing}
            onToggleFavorite={handleToggleFavorite}
            onToggleLike={handleToggleLike}
            onMarkSold={handleMarkSold}
            onSendMessage={handleSendMessage}
            onMarkConversationRead={handleMarkConversationRead}
            onRespondToOffer={handleRespondToOffer}
            onApproveListing={handleApproveListing}
            onRejectListing={handleRejectListing}
            onCreateBreed={handleCreateBreed}
            onCreateSubCategory={handleCreateSubCategory}
            onUpdateSubCategory={handleUpdateSubCategory}
            onDeleteSubCategory={handleDeleteSubCategory}
            onAutoCategorizeListings={handleAutoCategorizeListings}
            onRefreshData={loadAllData}
            onNotify={notify}
            notifications={notifications}
            onOpenNotification={handleOpenNotification}
            onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          />
        )}
        </Suspense>
      </main>

      <Footer
        currentUser={bootstrap.currentUser}
        breeds={bootstrap.breeds}
        onNavigate={navigate}
      />
    </div>
  );
}
