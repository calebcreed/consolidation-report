/**
 * Interactive HTML Report Generator
 *
 * Generates the HTML dashboard with live controls for migration/build/rollback.
 *
 * This is now a thin wrapper around the dashboard module.
 * The actual implementation is split into:
 *   - dashboard/styles.ts    (~160 lines) - CSS styles
 *   - dashboard/template.ts  (~195 lines) - HTML structure
 *   - dashboard/scripts/     (~850 lines) - Client JavaScript
 *     - websocket.ts  - WebSocket handling
 *     - ui.ts         - UI utilities
 *     - api.ts        - API calls
 *     - render.ts     - List rendering
 *     - graph.ts      - D3 visualization
 *     - timeline.ts   - Migration timeline
 *     - init.ts       - Initialization
 */

import { AnalysisReport } from '../report/types';
import { ServerConfig } from './state';
import { generateDashboardHtml } from './dashboard';

export function generateInteractiveHtml(report: AnalysisReport | null, config: ServerConfig | null): string {
  const reportJson = report ? JSON.stringify(report) : 'null';
  const configJson = config ? JSON.stringify(config) : 'null';

  return generateDashboardHtml(reportJson, configJson);
}
