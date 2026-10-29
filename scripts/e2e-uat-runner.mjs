import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:8080';
const API_URL = `${BASE_URL}/api/v1`;

const ADMIN_CREDS = { email: 'admin@relixor.internal', password: 'RelixorLocalAdmin2026!' };
const DEV_CREDS = { email: 'dev@relixor.internal', password: 'DevPassword123!' };
const VIEWER_CREDS = { email: 'viewer@relixor.internal', password: 'ViewerPassword123!' };

// Minimal valid zip/APK buffer
function createTestApkBuffer(appName = 'E2EApp', version = '1.0.0') {
  const comment = Buffer.from(`Relixor APK Artifact: ${appName} v${version}`);
  const manifestContent = Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.relixor.e2e" android:versionCode="100" android:versionName="${version}">\n  <application android:label="${appName}" />\n</manifest>`
  );

  const fileName = 'AndroidManifest.xml';
  const fileNameBuf = Buffer.from(fileName, 'utf8');

  function crc32(buf) {
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ (((crc ^ buf[i]) & 0xff) * 0xedb88320);
    }
    return (crc ^ -1) >>> 0;
  }
  const fileCrc = crc32(manifestContent);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0x4500, 10);
  localHeader.writeUInt16LE(0x5600, 12);
  localHeader.writeUInt32LE(fileCrc, 14);
  localHeader.writeUInt32LE(manifestContent.length, 18);
  localHeader.writeUInt32LE(manifestContent.length, 22);
  localHeader.writeUInt16LE(fileNameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const localFile = Buffer.concat([localHeader, fileNameBuf, manifestContent]);

  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0);
  cdHeader.writeUInt16LE(20, 4);
  cdHeader.writeUInt16LE(20, 6);
  cdHeader.writeUInt16LE(0, 8);
  cdHeader.writeUInt16LE(0, 10);
  cdHeader.writeUInt16LE(0x4500, 12);
  cdHeader.writeUInt16LE(0x5600, 14);
  cdHeader.writeUInt32LE(fileCrc, 16);
  cdHeader.writeUInt32LE(manifestContent.length, 20);
  cdHeader.writeUInt32LE(manifestContent.length, 24);
  cdHeader.writeUInt16LE(fileNameBuf.length, 28);
  cdHeader.writeUInt16LE(0, 30);
  cdHeader.writeUInt16LE(comment.length, 32);
  cdHeader.writeUInt16LE(0, 34);
  cdHeader.writeUInt16LE(0, 36);
  cdHeader.writeUInt32LE(0, 38);
  cdHeader.writeUInt32LE(0, 42);

  const centralDir = Buffer.concat([cdHeader, fileNameBuf, comment]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(localFile.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localFile, centralDir, eocd]);
}

const testResults = [];
function record(id, description, status, details = '') {
  testResults.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description} ${details ? '(' + details + ')' : ''}`);
}

async function run() {
  console.log('🚀 Starting Relixor Full E2E & Browser Verification...');
  console.log(`Target URL: ${BASE_URL}`);

  // Create test APK fixture on disk
  const tmpDir = path.resolve('/tmp/relixor-e2e-fixtures');
  fs.mkdirSync(tmpDir, { recursive: true });
  const validApkPath = path.join(tmpDir, 'valid-e2e-v1.0.0.apk');
  const validApkBuffer = createTestApkBuffer('E2E-App', '1.0.0');
  fs.writeFileSync(validApkPath, validApkBuffer);
  const expectedSha256 = crypto.createHash('sha256').update(validApkBuffer).digest('hex');

  const invalidApkPath = path.join(tmpDir, 'invalid-not-an-apk.apk');
  fs.writeFileSync(invalidApkPath, 'This is plain text and definitely not a valid zip archive!');

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });

  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    // 1. Home / Landing Page
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const pageTitle = await page.title();
    if (pageTitle.includes('Relixor')) {
      record('E2E-01', 'Open Home / Landing Page', 'PASS', `Title: ${pageTitle}`);
    } else {
      record('E2E-01', 'Open Home / Landing Page', 'FAIL', `Unexpected title: ${pageTitle}`);
    }

    // 2. Navigate to /login and verify form
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('form');
    record('E2E-02', 'Render Login Page Form', 'PASS');

    // 3. Test Invalid Credentials
    await page.fill('input[type="email"]', 'admin@relixor.internal');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Invalid email or password', { timeout: 5000 }).catch(() => null);
    const hasError = await page.locator('text=Invalid email or password').isVisible();
    if (hasError) {
      record('E2E-03', 'Reject Invalid Login Credentials', 'PASS', 'Shows "Invalid email or password" error banner');
    } else {
      record('E2E-03', 'Reject Invalid Login Credentials', 'FAIL', 'Error banner not found');
    }

    // 4. Log in as ADMIN
    await page.fill('input[type="email"]', ADMIN_CREDS.email);
    await page.fill('input[type="password"]', ADMIN_CREDS.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Overview Dashboard', { timeout: 10000 });
    record('E2E-04', 'Log in as ADMIN', 'PASS', 'Authenticated successfully, Dashboard rendered');

    // 5. Verify ADMIN sees navigation tabs: Dashboard, Applications, API Tokens, Users, Audit Logs, CI/CD Guide
    const navText = await page.locator('aside').innerText();
    const hasUsersTab = navText.includes('User Management');
    const hasAuditTab = navText.includes('Audit Logs');
    const hasTokensTab = navText.includes('API Tokens');
    if (hasUsersTab && hasAuditTab && hasTokensTab) {
      record('E2E-05', 'ADMIN Navigation Affordances', 'PASS', 'Sidebar contains Dashboard, Apps, Tokens, User Management, Audit Logs');
    } else {
      record('E2E-05', 'ADMIN Navigation Affordances', 'FAIL', 'Missing expected admin tabs');
    }

    // 6. Navigate to Applications and create a new application
    await page.click('aside button:has-text("Applications")');
    await page.waitForSelector('text=Applications');
    await page.click('button:has-text("Create New App")');
    await page.waitForSelector('input[placeholder="e.g. Relixor POS Terminal"]');

    const appUniquePkg = `com.e2e.test.${Date.now()}`;
    await page.fill('input[placeholder="e.g. Relixor POS Terminal"]', 'E2E Automated App');
    await page.fill('input[placeholder="e.g. com.relixor.pos"]', appUniquePkg);
    await page.fill('textarea[placeholder="Short summary of what this application does..."]', 'E2E browser test application');
    await page.click('button:has-text("Create Application")');

    // Wait for App Details screen to load
    await page.waitForSelector('text=E2E Automated App', { timeout: 8000 });
    record('E2E-06', 'Create Application via UI', 'PASS', `App created with package ${appUniquePkg}`);

    // 7. Test invalid APK upload (rejection)
    await page.click('button:has-text("Publish Release")');
    await page.waitForSelector('input[placeholder="e.g. 1.2.0"]');
    await page.fill('input[placeholder="e.g. 1.2.0"]', '1.0.0');
    await page.fill('input[placeholder="e.g. 120"]', '100');
    await page.setInputFiles('input[type="file"]', invalidApkPath);
    await page.click('div.fixed form button[type="submit"]:has-text("Publish Release")');
    await page.waitForSelector('text=Invalid file signature', { timeout: 5000 }).catch(() => null);
    const invalidUploadError = await page.locator('text=Invalid file signature').isVisible();
    if (invalidUploadError) {
      record('E2E-07', 'Server-side Invalid APK Header Rejection', 'PASS', 'Rejected non-zip text file as invalid APK');
    } else {
      record('E2E-07', 'Server-side Invalid APK Header Rejection', 'FAIL', 'Invalid APK was not rejected');
    }
    // Close modal
    await page.click('div.fixed button:has-text("Cancel")');

    // 8. Upload valid APK release
    await page.click('button:has-text("Publish Release")');
    await page.waitForSelector('input[placeholder="e.g. 1.2.0"]');
    await page.fill('input[placeholder="e.g. 1.2.0"]', '1.0.0');
    await page.fill('input[placeholder="e.g. 120"]', '100');
    await page.selectOption('select', 'DEV');
    await page.fill('textarea[placeholder="What\'s new in this build? Bug fixes, features, improvements..."]', 'Initial E2E release notes');
    await page.setInputFiles('input[type="file"]', validApkPath);
    await page.click('div.fixed form button[type="submit"]:has-text("Publish Release")');

    // Wait for release card to appear
    await page.waitForSelector('text=v1.0.0', { timeout: 10000 });
    record('E2E-08', 'Publish Valid APK Release via UI', 'PASS', 'Release v1.0.0 visible on App Details page');

    // 9. Verify duplicate version rejection
    await page.click('button:has-text("Publish Release")');
    await page.waitForSelector('input[placeholder="e.g. 1.2.0"]');
    await page.fill('input[placeholder="e.g. 1.2.0"]', '1.0.0');
    await page.fill('input[placeholder="e.g. 120"]', '100');
    await page.setInputFiles('input[type="file"]', validApkPath);
    await page.click('div.fixed form button[type="submit"]:has-text("Publish Release")');
    await page.waitForSelector('text=already exists', { timeout: 5000 }).catch(() => null);
    const duplicateError = await page.locator('text=already exists').isVisible();
    if (duplicateError) {
      record('E2E-09', 'Prevent Duplicate Release Upload', 'PASS', 'Duplicate version 1.0.0 (100) rejected');
    } else {
      record('E2E-09', 'Prevent Duplicate Release Upload', 'FAIL', 'Duplicate version was not rejected');
    }
    await page.click('div.fixed button:has-text("Cancel")');

    // 10. Download Artifact through UI and Verify SHA-256 Checksum
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Download APK")'),
    ]);
    const downloadPath = path.join(tmpDir, 'downloaded-e2e-artifact.apk');
    await download.saveAs(downloadPath);
    const downloadedBuffer = fs.readFileSync(downloadPath);
    const downloadedSha256 = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');

    if (downloadedSha256 === expectedSha256) {
      record('E2E-10', 'Download APK and Verify SHA-256 Match', 'PASS', `SHA-256 matches: ${expectedSha256}`);
    } else {
      record('E2E-10', 'Download APK and Verify SHA-256 Match', 'FAIL', `Expected ${expectedSha256}, got ${downloadedSha256}`);
    }

    // 11. Test QR Code Modal in UI
    await page.click('button[title="Scan QR Code to install directly on phone"]');
    await page.waitForSelector('text=Direct Mobile Install');
    const qrText = await page.locator('text=Scan this QR code').isVisible();
    if (qrText) {
      record('E2E-11', 'QR Code Mobile Install Modal', 'PASS', 'QR Code rendered for mobile scanner');
    } else {
      record('E2E-11', 'QR Code Mobile Install Modal', 'FAIL', 'QR Code modal did not render');
    }
    // Close QR modal by clicking the X button
    await page.click('div.fixed button:has(svg.lucide-x)');
    await page.waitForSelector('text=Direct Mobile Install', { state: 'detached', timeout: 5000 });

    // 12. Test Logout
    await page.click('button[title="Sign Out"]');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('form', { timeout: 5000 });
    record('E2E-12', 'Logout as ADMIN', 'PASS', 'Returned to Login form');

    // 13. Log in as DEVELOPER
    await page.fill('input[type="email"]', DEV_CREDS.email);
    await page.fill('input[type="password"]', DEV_CREDS.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Overview Dashboard', { timeout: 8000 });
    const devNav = await page.locator('aside').innerText();
    const devHasUsers = devNav.includes('User Management');
    if (!devHasUsers) {
      record('E2E-13', 'DEVELOPER Role Tab Restrictions', 'PASS', 'User Management tab hidden from Developer in sidebar');
    } else {
      record('E2E-13', 'DEVELOPER Role Tab Restrictions', 'FAIL', 'User Management tab unexpectedly visible to Developer');
    }

    // Test DEVELOPER direct API attempt to list users
    const devAuthToken = await page.evaluate(() => localStorage.getItem('relixor_auth_token'));
    const devUserListRes = await fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${devAuthToken}` },
    });
    if (devUserListRes.status === 403) {
      record('E2E-14', 'DEVELOPER Direct API Restriction on /users', 'PASS', 'HTTP 403 Forbidden returned');
    } else {
      record('E2E-14', 'DEVELOPER Direct API Restriction on /users', 'FAIL', `Expected 403, got ${devUserListRes.status}`);
    }

    // Test DEVELOPER creating an API token (WRITE allowed, ADMIN forbidden)
    const devWriteTokenRes = await fetch(`${API_URL}/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devAuthToken}`,
      },
      body: JSON.stringify({ name: 'Dev Runner Token', permission: 'WRITE' }),
    });
    if (devWriteTokenRes.status === 201) {
      record('E2E-15', 'DEVELOPER Create WRITE API Token', 'PASS', 'HTTP 201 Created');
    } else {
      record('E2E-15', 'DEVELOPER Create WRITE API Token', 'FAIL', `Status: ${devWriteTokenRes.status}`);
    }

    const devAdminTokenRes = await fetch(`${API_URL}/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devAuthToken}`,
      },
      body: JSON.stringify({ name: 'Dev Escalation Token', permission: 'ADMIN' }),
    });
    if (devAdminTokenRes.status === 403) {
      record('E2E-16', 'DEVELOPER Prevented from Creating ADMIN Token', 'PASS', 'HTTP 403 Forbidden (privilege escalation prevented)');
    } else {
      record('E2E-16', 'DEVELOPER Prevented from Creating ADMIN Token', 'FAIL', `Status: ${devAdminTokenRes.status}`);
    }

    // Logout DEVELOPER
    await page.click('button[title="Sign Out"]');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('form', { timeout: 5000 });

    // 14. Log in as VIEWER
    await page.fill('input[type="email"]', VIEWER_CREDS.email);
    await page.fill('input[type="password"]', VIEWER_CREDS.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Overview Dashboard', { timeout: 8000 });

    // Verify VIEWER nav tabs
    const viewerNav = await page.locator('aside').innerText();
    const viewerHasTokens = viewerNav.includes('API Tokens');
    const viewerHasUsers = viewerNav.includes('User Management');
    const viewerHasAudit = viewerNav.includes('Audit Logs');
    if (!viewerHasTokens && !viewerHasUsers && !viewerHasAudit) {
      record('E2E-17', 'VIEWER Sidebar Tab Restrictions', 'PASS', 'API Tokens, Users, and Audit Logs tabs hidden from VIEWER');
    } else {
      record('E2E-17', 'VIEWER Sidebar Tab Restrictions', 'FAIL', `Tabs leak: Tokens=${viewerHasTokens}, Users=${viewerHasUsers}, Audit=${viewerHasAudit}`);
    }

    // Go to Applications page as VIEWER
    await page.click('aside button:has-text("Applications")');
    await page.waitForSelector('text=Applications');
    const hasNewAppBtn = await page.locator('button:has-text("Create New App")').isVisible();
    if (!hasNewAppBtn) {
      record('E2E-18', 'VIEWER Forbidden from New Application UI', 'PASS', '"Create New App" button hidden for Viewer');
    } else {
      record('E2E-18', 'VIEWER Forbidden from New Application UI', 'FAIL', '"Create New App" button is visible to Viewer');
    }

    // Open demo app
    await page.click('text=Relixor POS Terminal');
    await page.waitForSelector('text=Relixor POS Terminal');

    // Verify VIEWER does NOT see "Publish Release" or "Delete"
    const hasUploadBtn = await page.locator('button:has-text("Publish Release")').isVisible();
    const hasDeleteAppBtn = await page.locator('button[title="Delete App"]').isVisible();
    if (!hasUploadBtn && !hasDeleteAppBtn) {
      record('E2E-19', 'VIEWER Release Management Controls Hidden', 'PASS', 'Publish and Delete buttons hidden from Viewer');
    } else {
      record('E2E-19', 'VIEWER Release Management Controls Hidden', 'FAIL', `Upload=${hasUploadBtn}, Delete=${hasDeleteAppBtn}`);
    }

    // EXPLICIT REQUIREMENT: Test whether VIEWER can download APKs!
    const [viewerDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Download APK")').first().click(),
    ]);
    const viewerDownloadPath = path.join(tmpDir, 'viewer-downloaded-artifact.apk');
    await viewerDownload.saveAs(viewerDownloadPath);
    const viewerDownloadedBuffer = fs.readFileSync(viewerDownloadPath);
    if (viewerDownloadedBuffer.length > 0 && viewerDownloadedBuffer.slice(0, 2).toString() === 'PK') {
      record('E2E-20', 'VIEWER Can Successfully Download APK', 'PASS', `Downloaded valid APK (${viewerDownloadedBuffer.length} bytes, PK zip header verified)`);
    } else {
      record('E2E-20', 'VIEWER Can Successfully Download APK', 'FAIL', `Downloaded invalid bytes (length: ${viewerDownloadedBuffer.length})`);
    }

    // 15. VIEWER Direct API Authorization Enforcement
    const viewerAuthToken = await page.evaluate(() => localStorage.getItem('relixor_auth_token'));
    const viewerDirectApiChecks = [
      { name: 'POST /api/v1/apps', url: `${API_URL}/apps`, method: 'POST', body: { name: 'Hack', packageName: 'com.hack' } },
      { name: 'POST /api/v1/tokens', url: `${API_URL}/tokens`, method: 'POST', body: { name: 'Viewer Token' } },
      { name: 'GET /api/v1/users', url: `${API_URL}/users`, method: 'GET' },
      { name: 'GET /api/v1/audit-logs', url: `${API_URL}/audit-logs`, method: 'GET' },
    ];

    for (const check of viewerDirectApiChecks) {
      const res = await fetch(check.url, {
        method: check.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerAuthToken}`,
        },
        body: check.body ? JSON.stringify(check.body) : undefined,
      });
      if (res.status === 403) {
        record('E2E-21', `VIEWER API Block: ${check.name}`, 'PASS', 'HTTP 403 Forbidden');
      } else {
        record('E2E-21', `VIEWER API Block: ${check.name}`, 'FAIL', `Expected 403, got ${res.status}`);
      }
    }

    // 16. Unauthorized direct download without token
    const unauthDownloadRes = await fetch(`${API_URL}/apps/random-id/releases/random-id/download`);
    if (unauthDownloadRes.status === 401) {
      record('E2E-22', 'Direct APK Download Without Authorization', 'PASS', 'HTTP 401 Unauthorized');
    } else {
      record('E2E-22', 'Direct APK Download Without Authorization', 'FAIL', `Expected 401, got ${unauthDownloadRes.status}`);
    }

    // 17. Page Refresh & Direct Navigation
    await page.reload();
    await page.waitForSelector('text=Relixor POS Terminal', { timeout: 8000 });
    record('E2E-23', 'Page Refresh & State Retention', 'PASS', 'Session and view persisted across reload');

  } catch (err) {
    console.error('Unhandled E2E runner error:', err);
    record('E2E-ERR', 'E2E Runner Execution', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n==========================================================');
  const passCount = testResults.filter((r) => r.status === 'PASS').length;
  const failCount = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`E2E Summary: Total: ${testResults.length} | PASS: ${passCount} | FAIL: ${failCount}`);
  console.log('==========================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

run();
