// @ts-check
// Contact-form honeypot (backlog B-Q43-04, acceptance bullet 2).
//
// Spec: public/contact.html (#contactForm) and prompted/index.html (#promptForm)
// each carry a hidden honeypot input named `website`: visually hidden, hidden
// from assistive tech (aria-hidden), out of the tab order (tabindex -1),
// autocomplete off. The submit script sends it in the JSON body. A real user
// never fills it, so a real submit sends `website: ""`. The Lambda drops a
// non-empty value silently with the normal success response (handler unit
// tests: test/unit/contact-form-handler.test.mjs).
//
// Surfaces: ericreilly.com/contact (PLAYWRIGHT_BASE_URL) and the prompted
// site. PROMPTED_BASE_URL overrides the prompted origin; otherwise it is
// derived from PLAYWRIGHT_BASE_URL (ericreilly.com -> prompted.ericreilly.com,
// staging.ericreilly.com -> staging.prompted.ericreilly.com).
//
// Layers in this file:
//   1. DOM / visibility / keyboard / accessibility-tree checks, phone
//      (390x844) and desktop (1440x900). No network stubs.
//   2. Payload field trace (TC-HP-PAYLOAD-*). RULE-7: the contact endpoint is
//      stubbed with page.route() at the browser network layer, the same
//      deviation contact.spec.js and theme-toggle.spec.js already carry
//      (test-signoff 2026-09-20: both pages post to the single production
//      contact API, so a real submit from any E2E run mails the owner). This
//      layer proves the field leaves the browser with the right value. It
//      cannot catch CORS, API Gateway throttling, the deployed Lambda's
//      behaviour or SES delivery.
//   3. Live real-boundary bot submit (TC-LIVE-HP-*), no stubs. Gated on
//      CI_LIVE_E2E=true AND CONTACT_API_HONEYPOT_LIVE=true: the second gate
//      asserts that the API the pages call runs the honeypot handler (today
//      the pages call the legacy k7cpfmv07e endpoint, whose source is not in
//      this repo; until cutover B-Q43-05 a bot submit there may send mail).
//      Blind spot: the owner's inbox is not observed; "no email" is proven by
//      the handler unit tests, this layer proves the live API answers a bot
//      with the normal success and the page shows it.
const { test, expect } = require('@playwright/test');

const SUCCESS_MESSAGE = 'Message sent. I will get back to you soon.';
const BOT_VALUE = 'http://spam.example';
const VIEWPORTS = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 900 },
];

function promptedOrigin(baseURL) {
  if (process.env.PROMPTED_BASE_URL) return process.env.PROMPTED_BASE_URL.replace(/\/$/, '');
  const u = new URL(baseURL || 'https://ericreilly.com');
  if (u.hostname === 'ericreilly.com' || u.hostname === 'www.ericreilly.com') {
    return `${u.protocol}//prompted.ericreilly.com`;
  }
  if (u.hostname.endsWith('.ericreilly.com')) {
    return `${u.protocol}//${u.hostname.replace(/\.ericreilly\.com$/, '.prompted.ericreilly.com')}`;
  }
  throw new Error(`Set PROMPTED_BASE_URL: cannot derive the prompted origin from ${baseURL}`);
}

const PAGES = [
  {
    key: 'contact',
    form: '#contactForm',
    visibleField: '#name',
    url: (baseURL) => new URL('/contact', baseURL).href,
    fillRealUser: async (page) => {
      await page.locator('#name').fill('Test User');
      await page.locator('#email').fill('test@example.com');
      await page.locator('#project').fill('Honeypot E2E check');
    },
    successLocator: (page) => page.locator('.form-message.success'),
  },
  {
    key: 'prompted',
    form: '#promptForm',
    visibleField: '#promptInput',
    url: (baseURL) => `${promptedOrigin(baseURL)}/`,
    fillRealUser: async (page) => {
      await page.locator('#promptInput').fill('Honeypot E2E check topic');
    },
    successLocator: (page) => page.locator('#promptForm .success'),
  },
];

/**
 * Runs in the page: is this element perceivable by a sighted user?
 * The ancestor walk stops at the enclosing <form>: the hiding must come from
 * the trap itself, not from page state such as the scroll-reveal fade
 * (`.reveal` sections start at opacity 0), which would give a false pass.
 */
function perceivableInPage(el) {
  if (!el) return { perceivable: false, how: 'missing' };
  if (el.getClientRects().length === 0) return { perceivable: false, how: 'not rendered (display:none)' };
  const own = getComputedStyle(el);
  if (own.visibility === 'hidden' || own.visibility === 'collapse') return { perceivable: false, how: 'visibility' };
  const stop = el.closest('form');
  for (let n = el; n && n !== stop && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (parseFloat(cs.opacity) === 0) return { perceivable: false, how: 'opacity 0' };
    const r = n.getBoundingClientRect();
    const tiny = r.width * r.height <= 1;
    if (n === el && tiny) return { perceivable: false, how: 'size <= 1px' };
    if (n !== el && tiny && cs.overflow !== 'visible') return { perceivable: false, how: 'clipped by zero-size ancestor' };
    if (/rect\(\s*0(px)?,?\s+0(px)?,?\s+0(px)?,?\s+0(px)?\s*\)/.test(cs.clip)) return { perceivable: false, how: 'clip rect(0)' };
    const inset = /^inset\(\s*(\d+(?:\.\d+)?)%/.exec(cs.clipPath);
    if (inset && parseFloat(inset[1]) >= 50) return { perceivable: false, how: 'clip-path inset' };
  }
  const r = el.getBoundingClientRect();
  const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const left = r.left + window.scrollX;
  const top = r.top + window.scrollY;
  if (left + r.width <= 0 || top + r.height <= 0 || left >= docW) return { perceivable: false, how: 'off-canvas' };
  return { perceivable: true, how: `rendered at ${Math.round(left)},${Math.round(top)} ${Math.round(r.width)}x${Math.round(r.height)}` };
}

/** Sets the honeypot the way a form-filling bot does (script, not keyboard). */
async function botFill(locator, value) {
  await locator.evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** RULE-7 stub of the first-party contact API; see the header for blind spots. */
async function captureContactPost(page) {
  const captured = { body: null, method: null, count: 0 };
  await page.route('**/prod/contact', async (route) => {
    captured.count += 1;
    captured.method = route.request().method();
    captured.body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ message: SUCCESS_MESSAGE }),
    });
  });
  return captured;
}

for (const p of PAGES) {
  test.describe(`${p.key} honeypot: markup and accessibility`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await page.goto(p.url(baseURL));
    });

    // TC-HP-${key}-001
    test(`${p.key}_form_contains_exactly_one_honeypot_input_named_website`, async ({ page }) => {
      const form = page.locator(p.form);
      await expect(form).toBeVisible();
      await expect(form.locator('input[name="website"]')).toHaveCount(1);
      // Only one control on the whole page may carry that name.
      await expect(page.locator('[name="website"]')).toHaveCount(1);
    });

    // TC-HP-${key}-002
    test(`${p.key}_honeypot_is_out_of_tab_order_autocomplete_off_and_aria_hidden`, async ({ page }) => {
      const hp = page.locator(`${p.form} input[name="website"]`);
      await expect(hp).toHaveCount(1);
      await expect(hp).toHaveAttribute('tabindex', '-1');
      await expect(hp).toHaveAttribute('autocomplete', 'off');
      const attrs = await hp.evaluate((el) => ({
        type: el.type,
        value: el.value,
        required: el.required,
        tabIndex: el.tabIndex,
        ariaHiddenOnSelfOrAncestor: !!el.closest('[aria-hidden="true"]'),
      }));
      expect(attrs.ariaHiddenOnSelfOrAncestor).toBe(true);
      expect(attrs.tabIndex).toBe(-1);
      // A required or pre-filled trap would block or drop every real user.
      expect(attrs.required).toBe(false);
      expect(attrs.value).toBe('');
      expect(['text', 'url']).toContain(attrs.type);
    });

    // TC-HP-${key}-003
    test(`${p.key}_honeypot_is_not_in_the_accessibility_tree_as_a_textbox`, async ({ page }) => {
      const form = page.locator(p.form);
      await expect(form.locator('input[name="website"]')).toHaveCount(1);
      // getByRole excludes aria-hidden subtrees, which is what a screen reader sees.
      const exposedNames = await form.getByRole('textbox').evaluateAll((els) => els.map((e) => e.getAttribute('name') || e.id));
      expect(exposedNames.length).toBeGreaterThan(0);
      expect(exposedNames).not.toContain('website');
    });

    // TC-HP-${key}-004
    test(`${p.key}_keyboard_tab_and_shift_tab_through_form_never_focus_honeypot`, async ({ page }) => {
      await expect(page.locator(`${p.form} input[name="website"]`)).toHaveCount(1);
      const submit = page.locator(`${p.form} #submitBtn`);
      await expect(submit).toBeVisible();
      const visited = [];
      const record = async () =>
        page.evaluate((formSel) => {
          const a = document.activeElement;
          const inForm = !!(a && a.closest(formSel));
          return { inForm, name: a ? a.getAttribute('name') || a.id || a.tagName : null };
        }, p.form);
      for (const key of ['Shift+Tab', 'Tab']) {
        await submit.focus();
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press(key);
          const at = await record();
          if (!at.inForm) break;
          visited.push(at.name);
        }
      }
      expect(visited.length).toBeGreaterThan(0);
      expect(visited).not.toContain('website');
    });

    for (const vp of VIEWPORTS) {
      // TC-HP-${key}-005 (phone) / -006 (desktop)
      test(`${p.key}_honeypot_and_its_label_are_not_visible_to_a_sighted_user_at_${vp.label}_${vp.width}x${vp.height}`, async ({ page, baseURL }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(p.url(baseURL));
        const hp = page.locator(`${p.form} input[name="website"]`);
        await expect(hp).toHaveCount(1);
        // Control: the detector must report a real visible field as perceivable,
        // or a broken detector would pass every page.
        const control = await page.locator(p.visibleField).evaluate(perceivableInPage);
        expect(control.perceivable, `control field ${p.visibleField} should be perceivable: ${control.how}`).toBe(true);
        const field = await hp.evaluate(perceivableInPage);
        expect(field.perceivable, `honeypot is perceivable: ${field.how}`).toBe(false);
        const labels = await hp.evaluate((el) => Array.from(el.labels || []).length);
        for (let i = 0; i < labels; i++) {
          const handle = await hp.evaluateHandle((el, idx) => el.labels[idx], i);
          const lab = await handle.evaluate(perceivableInPage);
          expect(lab.perceivable, `honeypot label ${i} is perceivable: ${lab.how}`).toBe(false);
        }
        // The visible form still works for people: the submit button shows.
        await expect(page.locator(`${p.form} #submitBtn`)).toBeVisible();
        await expect(page.locator(`${p.form} #submitBtn`)).toBeEnabled();
        // The trap must not push the layout sideways on phones. Scoped to the
        // form and the trap: the contact nav already overflows at 390px on
        // main, which is a separate defect this test must not mask or inherit.
        const box = await hp.evaluate((el, formSel) => {
          const form = el.closest(formSel);
          const trap = el.closest('[aria-hidden="true"]') || el;
          return {
            trapRight: Math.max(trap.getBoundingClientRect().right, el.getBoundingClientRect().right),
            formOverflow: form.scrollWidth - form.clientWidth,
            innerWidth: window.innerWidth,
          };
        }, p.form);
        expect(box.trapRight).toBeLessThanOrEqual(box.innerWidth);
        expect(box.formOverflow).toBeLessThanOrEqual(0);
      });
    }
  });

  test.describe(`${p.key} honeypot: payload field trace (stubbed API, RULE-7)`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await page.goto(p.url(baseURL));
    });

    // TC-HP-PAYLOAD-${key}-001
    test(`${p.key}_real_user_submit_sends_website_as_empty_string_in_json_body`, async ({ page }) => {
      const captured = await captureContactPost(page);
      await expect(page.locator(`${p.form} input[name="website"]`)).toHaveCount(1);
      await p.fillRealUser(page);
      await page.locator(`${p.form} #submitBtn`).click();
      await expect(p.successLocator(page)).toBeVisible();
      expect(captured.count).toBe(1);
      expect(captured.method).toBe('POST');
      expect(Object.prototype.hasOwnProperty.call(captured.body, 'website')).toBe(true);
      expect(captured.body.website).toBe('');
    });

    // TC-HP-PAYLOAD-${key}-002
    test(`${p.key}_bot_filled_honeypot_value_is_sent_verbatim_and_page_shows_normal_success`, async ({ page }) => {
      const captured = await captureContactPost(page);
      const hp = page.locator(`${p.form} input[name="website"]`);
      await expect(hp).toHaveCount(1);
      await p.fillRealUser(page);
      await botFill(hp, BOT_VALUE);
      await page.locator(`${p.form} #submitBtn`).click();
      await expect(p.successLocator(page)).toBeVisible();
      if (p.key === 'contact') await expect(p.successLocator(page)).toHaveText(SUCCESS_MESSAGE);
      expect(captured.count).toBe(1);
      expect(captured.body.website).toBe(BOT_VALUE);
    });
  });

  test.describe(`${p.key} honeypot: live API bot submit (no stubs)`, () => {
    test.describe.configure({ mode: 'serial', retries: 0 });
    test.skip(
      process.env.CI_LIVE_E2E !== 'true' || process.env.CONTACT_API_HONEYPOT_LIVE !== 'true',
      'live bot submit needs CI_LIVE_E2E=true and CONTACT_API_HONEYPOT_LIVE=true (the API the page calls must run the honeypot handler)',
    );

    /*
     * Test ID: TC-LIVE-HP-${key}-001
     * AC: B-Q43-04 bullet 2 (honeypot sent in JSON body; non-empty value answered as success, no mail)
     * Permutation: signed-out visitor (the only auth state), desktop, direct load of the page URL
     * Preconditions: the deployed page posts to an API running the honeypot handler
     * Steps:
     *   1. Bot -> loads the page -> the form and a hidden `website` input exist
     *   2. Bot -> fills the visible fields and sets `website` by script -> no visible change
     *   3. Bot -> submits -> one POST leaves the browser carrying website=<bot value>
     *   4. Live API -> answers 200 with the normal success body -> page shows the normal success state
     * Acceptance: response status 200, body {"message": SUCCESS_MESSAGE}; page success state visible.
     * Cleanup: none needed; the honeypot path creates no record and sends no mail (RULE-5).
     */
    test(`${p.key}_live_bot_submit_with_filled_honeypot_gets_normal_200_success_from_real_api`, async ({ page, baseURL }) => {
      await page.goto(p.url(baseURL));
      const hp = page.locator(`${p.form} input[name="website"]`);
      // Assert the trap exists before anything is sent, so a page without it
      // never posts a real submission to the live API.
      await expect(hp).toHaveCount(1);
      await p.fillRealUser(page);
      await botFill(hp, BOT_VALUE);
      const reqP = page.waitForRequest((r) => r.method() === 'POST' && /\/contact$/.test(new URL(r.url()).pathname));
      const resP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/contact$/.test(new URL(r.url()).pathname));
      await page.locator(`${p.form} #submitBtn`).click();
      const req = await reqP;
      expect(JSON.parse(req.postData() || '{}').website).toBe(BOT_VALUE);
      const res = await resP;
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ message: SUCCESS_MESSAGE });
      await expect(p.successLocator(page)).toBeVisible();
      if (p.key === 'contact') await expect(p.successLocator(page)).toHaveText(SUCCESS_MESSAGE);
    });
  });
}
