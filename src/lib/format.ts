export function formatPriceSar(amount: number): string {
  return `${amount.toLocaleString('en-US')} ر.س`;
}

export function formatRelativeArabicTime(isoDate: string, nowMs: number = Date.now()): string {
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return 'الآن';
  const diffMs = Math.max(0, nowMs - ts);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'قبل قليل';
  if (diffHours === 1) return 'منذ ساعة';
  if (diffHours === 2) return 'منذ ساعتين';
  if (diffHours <= 10) return `منذ ${diffHours} ساعات`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'أمس';
  if (diffDays === 2) return 'منذ يومين';
  if (diffDays <= 10) return `منذ ${diffDays} أيام`;
  return `منذ ${diffDays} يوماً`;
}

export function formatArabicGregorianDate(
  dateInput: Date | string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', options).format(date);
}

export function formatStatusLabel(status: string): string {
  switch (status) {
    case 'Published':
      return 'منشور';
    case 'Pending':
      return 'بانتظار المراجعة';
    case 'Rejected':
      return 'مرفوض';
    case 'Sold':
      return 'تم البيع';
    case 'Draft':
      return 'مسودة';
    case 'Expired':
      return 'منتهي الصلاحية';
    default:
      return status;
  }
}

export const STOCK_GALLERY_OPTIONS = [
  { label: 'نعيمي بلدي', url: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg' },
  { label: 'نجدي أصيل', url: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg' },
  { label: 'حري حجازي', url: '/src/assets/images/breed_harri_sheep_1794608169989.jpg' },
  { label: 'ماعز عارضي', url: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg' },
  { label: 'سواكني محلي', url: '/src/assets/images/breed_sawakni_camels_1794608171012.jpg' },
];
