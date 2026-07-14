import * as application from './index';
import { describe, expect, it } from 'vitest';

describe('application package exports', () => {
  it('exports the supported service and projection entry points', () => {
    expect(application.createStudioService).toBeTypeOf('function');
    expect(application.createCaptureService).toBeTypeOf('function');
    expect(application.projectRoom).toBeTypeOf('function');
    expect(application.createViewStateRepository).toBeTypeOf('function');
    expect(application.createLifeAreaRepository).toBeTypeOf('function');
    expect(application.createDiagnosticsRecorder).toBeTypeOf('function');
    expect(application.prepareDiagnosticsExport).toBeTypeOf('function');
  });
});
