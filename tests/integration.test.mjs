import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.API_PREFIX = '/api/v1';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sunvika_phase11_test';
process.env.JWT_ACCESS_SECRET = 'phase-eleven-integration-secret-at-least-32-characters';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.SWAGGER_ENABLED = 'true';
process.env.LOG_LEVEL = 'silent';

const { default: app } = await import('../dist/app.js');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('health endpoint reports unavailable while MongoDB is disconnected and Helmet headers are set', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('OpenAPI JSON documents the implemented business route groups', async () => {
  const response = await fetch(`${baseUrl}/api-docs/openapi.json`);
  assert.equal(response.status, 200);
  const document = await response.json();
  for (const path of [
    '/geography/states', '/leads/{leadId}/status', '/visits/{visitId}',
    '/customers/{customerId}/documents/upload-url', '/quotations/{quotationId}/share',
    '/dashboard/summary', '/reports/state-performance', '/amc/{contractId}/service-history',
    '/audit-logs', '/public/shares/{token}'
  ]) assert.ok(document.paths[path], `missing OpenAPI path ${path}`);
});

test('protected dashboard rejects requests without a bearer token', async () => {
  const response = await fetch(`${baseUrl}/api/v1/dashboard/summary`);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.message, 'Authentication required');
});

test('audit log reader rejects anonymous requests', async () => {
  const response = await fetch(`${baseUrl}/api/v1/audit-logs`);
  assert.equal(response.status, 401);
});

test('login validates malformed input before database access', async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bad', password: '' })
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.ok(body.errors.length > 0);
});

test('login and cookie-authenticated mutations reject unapproved request origins', async () => {
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'user@example.com', password: 'secret' })
  });
  assert.equal(login.status, 403);
  assert.equal(login.headers.get('access-control-allow-origin'), null);
  const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: 'POST', headers: { origin: 'https://attacker.example', cookie: 'refreshToken=invalid' }
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});


test('calling-list upload, preview, download and conversion endpoints require authentication', async () => {
  const listId = '0123456789abcdef01234567';
  for (const [path, method] of [['/calling-lists/template', 'GET'], ['/calling-lists', 'GET'], ['/calling-lists', 'POST'], ['/calling-lists/managers', 'GET'], ['/calling-lists/filter-options', 'GET'], [`/calling-lists/${listId}/file`, 'PUT'], [`/calling-lists/${listId}/preview`, 'GET'], [`/calling-lists/${listId}/download-url`, 'GET'], [`/calling-lists/${listId}/assignment`, 'PATCH'], [`/calling-lists/${listId}/candidates/${listId}/create-cp`, 'POST'], [`/calling-lists/${listId}/candidates/${listId}?confirm=true`, 'DELETE'], [`/calling-lists/${listId}/candidates/${listId}/status`, 'PATCH']]) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, { method });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});


test('customer-to-CP preparation and confirmation require authentication', async () => {
  const customerId = '0123456789abcdef01234567';
  for (const [method, path] of [['GET', 'cp-conversion'], ['POST', 'convert-to-cp']]) {
    const response = await fetch(`${baseUrl}/api/v1/customers/${customerId}/${path}`, { method });
    assert.equal(response.status, 401);
  }
});


test('query conversations and per-user notifications reject unauthenticated requests', async () => {
  const id='0123456789abcdef01234567';
  for(const [method,path] of [['GET','/queries'],['GET','/queries/recipients'],['POST','/queries'],['GET',`/queries/${id}`],['POST',`/queries/${id}/replies`],['POST',`/queries/${id}/seen`],['GET','/notifications'],['POST',`/notifications/${id}/seen`]]) {
    const response=await fetch(`${baseUrl}/api/v1${path}`,{method});assert.equal(response.status,401,`${method} ${path}`);
  }
});


test('announcement feeds and publishing require a live authenticated session',async()=>{
  for(const [method,path]of[['GET','/announcements/feed'],['GET','/announcements/audience'],['GET','/announcements'],['POST','/announcements'],['PATCH','/announcements/0123456789abcdef01234567']]){const response=await fetch(`${baseUrl}/api/v1${path}`,{method});assert.equal(response.status,401,`${method} ${path}`);}
});


test('calling daily reports and upline verification require authentication',async()=>{
  for(const [method,path]of[['GET','/calling-reports/options'],['GET','/calling-reports?period=WEEK'],['POST','/calling-reports/today'],['POST','/calling-reports/0123456789abcdef01234567/verify']]){
    const response=await fetch(`${baseUrl}/api/v1${path}`,{method});assert.equal(response.status,401,`${method} ${path}`);
  }
});
