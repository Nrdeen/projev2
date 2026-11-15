import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Phase 4A Homepage, Header, and Footer preserve Phase 1-3 contracts and implement all redesigned sections', () => {
  const headerSrc = readFileSync(resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');
  assert.match(headerSrc, /getRoleAwareNavItems/);
  assert.match(headerSrc, /aria-label="التنقل الرئيسي"/);
  assert.match(headerSrc, /id="mobile-nav-drawer"/);
  assert.match(headerSrc, /fixed inset-0 top-16/);
  assert.match(headerSrc, /onMarkAllNotificationsRead/);

  const heroSrc = readFileSync(resolve(process.cwd(), 'src/components/HeroSearch.tsx'), 'utf8');
  assert.match(heroSrc, /id="hero-search-q"/);
  assert.match(heroSrc, /id="hero-cat"/);
  assert.match(heroSrc, /id="hero-breed"/);
  assert.match(heroSrc, /id="hero-reg"/);
  assert.match(heroSrc, /id="hero-price"/);
  assert.match(heroSrc, /onBrowseAll/);
  assert.match(heroSrc, /onAddListing/);
  assert.match(heroSrc, /تصفّح المواشي المتاحة/);
  assert.match(heroSrc, /أضف إعلانك الآن/);

  const sectionsSrc = readFileSync(
    resolve(process.cwd(), 'src/components/HomeSections.tsx'),
    'utf8'
  );
  assert.match(sectionsSrc, /export function HomeCategoriesSection/);
  assert.match(sectionsSrc, /export function HomeBreedsSection/);
  assert.match(sectionsSrc, /export function HomeBreedersSection/);
  assert.match(sectionsSrc, /export function HomeTrustSection/);
  assert.match(sectionsSrc, /export function HomeGuidesSection/);
  assert.match(sectionsSrc, /verifiedSellers\.length === 0/);
  assert.match(sectionsSrc, /VerifiedSellerBadge/);
  assert.match(sectionsSrc, /import\s+\{\s*Modal\s*\}\s+from\s+'\.\/Modal'/);

  const footerSrc = readFileSync(resolve(process.cwd(), 'src/components/Footer.tsx'), 'utf8');
  assert.match(footerSrc, /getRoleAwareFooterAccountLinks/);
  assert.match(footerSrc, /أقسام المنصة/);
  assert.match(footerSrc, /السلالات الشائعة/);
  assert.doesNotMatch(footerSrc, /href="#"/);

  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /<HomeCategoriesSection/);
  assert.match(appSrc, /<HomeBreedsSection/);
  assert.match(appSrc, /<HomeBreedersSection/);
  assert.match(appSrc, /<HomeTrustSection/);
  assert.match(appSrc, /<HomeGuidesSection/);
  assert.match(appSrc, /verifiedSellers=\{verifiedHomeSellers\}/);
});
