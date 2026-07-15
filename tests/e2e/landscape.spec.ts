import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill('Landscape Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function addHomeVision(page: Page, title = 'A calm home'): Promise<void> {
  await page.getByRole('button', { name: 'Open Home' }).click();
  await page
    .getByRole('region', { name: 'Vision' })
    .getByRole('button', { name: '+ Add' })
    .click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill(title);
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(
    page.getByRole('button', { name: title, exact: true }),
  ).toBeVisible();
}

async function addHomeVisionFromMatrix(
  page: Page,
  title = 'A calm home',
): Promise<void> {
  await page.getByRole('button', { name: 'Add to Home Vision' }).click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill(title);
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(
    page.getByRole('button', { name: title, exact: true }),
  ).toBeVisible();
}

test('moves through matrix, focus, and lens without page overflow', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Mobile opens the focused stack directly.',
  );
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await expect(
    page.getByRole('region', { name: 'Life Landscape matrix' }),
  ).toBeVisible();
  await addHomeVisionFromMatrix(page);
  await page.getByRole('button', { name: 'Open Home' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: 'Lens' }).click();
  await expect(page.getByRole('heading', { name: 'Vision' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('landscape-lens.png'),
    fullPage: true,
  });
});

test('keeps matrix headings fixed inside the Landscape scrollport', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Mobile uses the focused stack.',
  );
  await page.setViewportSize({ width: 1440, height: 600 });
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();

  const region = page.getByRole('region', { name: 'Life Landscape matrix' });
  const heading = page.getByRole('button', { name: 'Open Family' });
  const before = await heading.boundingBox();
  const scrollTop = await region.evaluate((element) => {
    element.scrollTop = 320;
    return element.scrollTop;
  });
  const after = await heading.boundingBox();

  expect(scrollTop).toBeGreaterThan(0);
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
});

test('persists custom and renamed life areas across reload', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Area management is verified in the desktop map.',
  );
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await page.getByText('Manage life areas').click();
  await page.getByLabel('New life area').fill('Play & Wonder');
  await page.getByRole('button', { name: 'Add custom area' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Play & Wonder' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Rename Home' }).click();
  await page.getByLabel('Name for Home').fill('Home & Hearth');
  await page.getByRole('button', { name: 'Save Home name' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Home & Hearth' }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Open Landscape Studio' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Play & Wonder' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Home & Hearth' }),
  ).toBeVisible();
});

test('authors and displays a decision horizon', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Desktop capture verifies the shared durable workflow.',
  );
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await page.getByRole('button', { name: 'Open Family' }).click();
  await page
    .getByRole('region', { name: 'Decisions' })
    .getByRole('button', { name: '+ Add' })
    .click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('Choose a weekly family rhythm');
  await page.getByLabel('Decision horizon').selectOption('60d');
  await page.getByRole('button', { name: 'Remember' }).click();

  const decisions = page.getByRole('region', { name: 'Decisions' });
  await expect(
    decisions.getByRole('button', {
      name: 'Choose a weekly family rhythm',
      exact: true,
    }),
  ).toBeVisible();
  await expect(decisions.getByText('60 days')).toBeVisible();
});

test('moves, links, and undoes one canonical note', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Desktop authors across the matrix; mobile focus is covered separately.',
  );
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await addHomeVision(page);

  if (testInfo.project.name === 'desktop-chromium') {
    const identityDrop = page
      .getByRole('region', { name: 'Identity, values & feelings' })
      .locator('.life-landscape__section-drop');
    await identityDrop.scrollIntoViewIfNeeded();
    const handle = await page
      .getByRole('button', { name: 'Drag A calm home' })
      .boundingBox();
    if (!handle) throw new Error('Landscape drag targets were not rendered.');
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handle.x + handle.width / 2 + 16,
      handle.y + handle.height / 2,
      { steps: 3 },
    );
    await expect(
      page.getByRole('status', { name: 'Drag preview for A calm home' }),
    ).toBeVisible();
    const identity = await identityDrop.boundingBox();
    if (!identity) throw new Error('Landscape destination was not rendered.');
    await page.mouse.move(
      identity.x + identity.width / 2,
      identity.y + identity.height / 2,
      { steps: 8 },
    );
    await expect(identityDrop).toHaveClass(/--drop-preview/);
    await page.mouse.up();
    await expect(
      page
        .getByRole('region', { name: 'Identity, values & feelings' })
        .getByRole('button', { name: 'A calm home', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo move' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Vision' })
        .getByRole('button', { name: 'A calm home', exact: true }),
    ).toBeVisible();
  }

  await page.getByRole('button', { name: 'Move A calm home' }).click();
  await page.getByRole('menuitem', { name: /Move to Practices/ }).click();
  await expect(
    page
      .getByRole('region', { name: 'Practices' })
      .getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Vision' })
      .getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Move A calm home' }).click();
  await page.getByRole('menuitem', { name: 'Also show in Family' }).click();
  await page.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Vision' })
      .getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();
});

test('keyboard menu restores focus after reorder, link, and reparented move', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The same menu is covered through the desktop keyboard path.',
  );
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await addHomeVision(page, 'First keyboard note');
  const vision = page.getByRole('region', { name: 'Vision' });
  await vision.getByRole('button', { name: '+ Add' }).click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('Second keyboard note');
  await page.getByRole('button', { name: 'Remember' }).click();

  const trigger = page.getByRole('button', {
    name: 'Move Second keyboard note',
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('menuitem', { name: 'Move later' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toBeFocused();
  await expect(trigger).toBeEnabled();

  await page.keyboard.press('Enter');
  const link = page.getByRole('menuitem', { name: 'Also show in Family' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toBeFocused();
  await expect(trigger).toBeEnabled();

  await page.keyboard.press('Enter');
  const move = page.getByRole('menuitem', { name: /Move to Practices/ });
  await move.focus();
  await page.keyboard.press('Enter');
  const movedTitle = page
    .getByRole('region', { name: 'Practices' })
    .getByRole('button', { name: 'Second keyboard note', exact: true });
  await expect(movedTitle).toBeVisible();
  await expect(movedTitle).toBeFocused();
});

test('restores the exact menu action after a concurrent move conflict', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The production Chromium and WebKit desktop menus prove retry focus.',
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await addHomeVision(page, 'Concurrent focus note');

  const trigger = page.getByRole('button', {
    name: 'Move Concurrent focus note',
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const failedAction = page.getByRole('menuitem', {
    name: /Move to Practices/,
  });
  await failedAction.focus();

  await page.evaluate(async () => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (active === null) throw new Error('No active Studio');
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), {
        once: true,
      });
      request.addEventListener('error', () => reject(request.error), {
        once: true,
      });
    });
    const readTransaction = database.transaction('files', 'readonly');
    const read = readTransaction
      .objectStore('files')
      .index('vault')
      .getAll(active);
    const records = await new Promise<
      Array<{
        key: string;
        vault: string;
        path: string;
        bytes: ArrayBuffer;
        hash: string;
        modifiedAt: string;
      }>
    >((resolve, reject) => {
      read.addEventListener('success', () => resolve(read.result), {
        once: true,
      });
      read.addEventListener('error', () => reject(read.error), { once: true });
    });
    const record = records.find((item) =>
      item.path.startsWith('Life Landscape/home/'),
    );
    if (record === undefined) throw new Error('No Landscape note found');
    const text = new TextDecoder().decode(record.bytes);
    const bytes = new TextEncoder().encode(
      text.replace('Concurrent focus note', 'Concurrent durable version'),
    );
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    record.bytes = bytes.buffer;
    record.hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    record.modifiedAt = new Date().toISOString();
    const writeTransaction = database.transaction('files', 'readwrite');
    writeTransaction.objectStore('files').put(record);
    await new Promise<void>((resolve, reject) => {
      writeTransaction.addEventListener('complete', () => resolve(), {
        once: true,
      });
      writeTransaction.addEventListener(
        'error',
        () => reject(writeTransaction.error),
        { once: true },
      );
    });
    database.close();
  });

  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText(
    'This note changed elsewhere. Both versions have been preserved for review.',
  );
  await expect(failedAction).toBeFocused();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Vision' })
      .getByRole('button', { name: 'Concurrent durable version', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Vision' })
      .getByRole('button', { name: 'Concurrent focus note', exact: true }),
  ).toHaveCount(0);
});

test('mobile routes directly to one area and never renders the matrix', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createLocalStudio(page);
  await page.goto('/landscape/home');
  await page.getByRole('button', { name: 'Open Landscape Studio' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.locator('.life-landscape__matrix')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('touch long-press shows a destination preview, cancels safely, then moves', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Touch proof runs in mobile Chromium.',
  );
  await createLocalStudio(page);
  await page.goto('/landscape/home');
  await page.getByRole('button', { name: 'Open Landscape Studio' }).click();
  await page
    .getByRole('region', { name: 'Vision' })
    .getByRole('button', { name: '+ Add' })
    .click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('A calm home');
  await page.getByRole('button', { name: 'Remember' }).click();

  const handle = page.getByRole('button', { name: 'Drag A calm home' });
  const destination = page.getByRole('region', {
    name: 'Identity, values & feelings',
  });
  const handleBox = await handle.boundingBox();
  const destinationBox = await destination
    .locator('.life-landscape__section-drop')
    .boundingBox();
  if (!handleBox || !destinationBox)
    throw new Error('Touch drag targets were not rendered.');
  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  const target = {
    x: destinationBox.x + destinationBox.width / 2,
    y: destinationBox.y + destinationBox.height / 2,
  };
  const dispatchTouch = async (
    type: 'touchstart' | 'touchmove' | 'touchend',
    point: { x: number; y: number },
  ) => {
    await handle.evaluate(
      (element, event) => {
        const touch = new Touch({
          clientX: event.point.x,
          clientY: event.point.y,
          identifier: 1,
          target: element,
        });
        element.dispatchEvent(
          new TouchEvent(event.type, {
            bubbles: true,
            cancelable: true,
            changedTouches: [touch],
            targetTouches: event.type === 'touchend' ? [] : [touch],
            touches: event.type === 'touchend' ? [] : [touch],
          }),
        );
      },
      { point, type },
    );
  };

  await dispatchTouch('touchstart', start);
  await page.waitForTimeout(550);
  await expect(
    page.getByRole('status', { name: 'Drag preview for A calm home' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel drag' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('status', { name: 'Drag preview for A calm home' }),
  ).toHaveCount(0);
  await dispatchTouch('touchend', start);
  await expect(
    page
      .getByRole('region', { name: 'Vision' })
      .getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();

  await dispatchTouch('touchstart', start);
  await page.waitForTimeout(550);
  await dispatchTouch('touchmove', target);
  await dispatchTouch('touchend', target);
  await expect(
    destination.getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();
});
