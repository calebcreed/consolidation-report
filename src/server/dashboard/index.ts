/**
 * Dashboard Module
 *
 * Combines styles, template, and scripts into the complete dashboard HTML.
 * This is the main export - import this to generate the dashboard.
 */

import { DASHBOARD_STYLES } from './styles';
import { DASHBOARD_TEMPLATE } from './template';
import { generateDashboardScripts } from './scripts';

export { DASHBOARD_STYLES } from './styles';
export { DASHBOARD_TEMPLATE } from './template';
export { generateDashboardScripts } from './scripts';

/**
 * Generate the complete interactive dashboard HTML
 */
export function generateDashboardHtml(reportJson: string, configJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Branch Consolidator</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>${DASHBOARD_STYLES}</style>
</head>
<body>
  ${DASHBOARD_TEMPLATE}
  <script>${generateDashboardScripts(reportJson, configJson)}</script>
</body>
</html>`;
}
