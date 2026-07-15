import { describe, expect, it } from 'vitest';

import {
  collectRegistryVersions,
  findBlockingAdvisories,
} from '../../scripts/lib/npm-production-audit.mjs';

describe('production dependency audit', () => {
  it('collects unique registry package versions while excluding workspace links', () => {
    const projects = [
      {
        dependencies: {
          '@studio/domain': {
            version: 'link:../../packages/domain',
          },
          react: {
            version: '19.1.0',
            resolved: 'https://registry.npmjs.org/react/-/react-19.1.0.tgz',
            dependencies: {
              scheduler: {
                version: '0.26.0',
                resolved:
                  'https://registry.npmjs.org/scheduler/-/scheduler-0.26.0.tgz',
              },
            },
          },
        },
      },
      {
        dependencies: {
          react: {
            version: '19.1.0',
            resolved: 'https://registry.npmjs.org/react/-/react-19.1.0.tgz',
          },
        },
      },
    ];

    expect(collectRegistryVersions(projects)).toEqual({
      react: ['19.1.0'],
      scheduler: ['0.26.0'],
    });
  });

  it('blocks high and critical advisories but reports lower severities separately', () => {
    const advisories = {
      alpha: [
        {
          id: 1,
          severity: 'moderate',
          title: 'Moderate issue',
          url: 'https://example.test/1',
          vulnerable_versions: '<2',
        },
      ],
      beta: [
        {
          id: 2,
          severity: 'high',
          title: 'High issue',
          url: 'https://example.test/2',
          vulnerable_versions: '<3',
        },
        {
          id: 3,
          severity: 'critical',
          title: 'Critical issue',
          url: 'https://example.test/3',
          vulnerable_versions: '<4',
        },
      ],
    };

    expect(findBlockingAdvisories(advisories, 'high')).toEqual([
      expect.objectContaining({ packageName: 'beta', severity: 'critical' }),
      expect.objectContaining({ packageName: 'beta', severity: 'high' }),
    ]);
  });
});
