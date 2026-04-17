/**
 * Dashboard Scripts - Combined Export
 *
 * Combines all script modules into a single string for embedding.
 */

import { WEBSOCKET_SCRIPT } from './websocket';
import { UI_SCRIPT } from './ui';
import { API_SCRIPT } from './api';
import { RENDER_SCRIPT } from './render';
import { GRAPH_SCRIPT } from './graph';
import { TIMELINE_SCRIPT } from './timeline';
import { INIT_SCRIPT } from './init';

/**
 * Generate the complete client-side JavaScript
 * @param reportJson - Serialized report data
 * @param configJson - Serialized config data
 */
export function generateDashboardScripts(reportJson: string, configJson: string): string {
  return `
    // Initial data from server
    let REPORT = ${reportJson};
    let CONFIG = ${configJson};
    let MIGRATIONS = [];
    let REDO_STACK = [];
    let CURRENT_COMMIT = null;
    let ws = null;

    ${WEBSOCKET_SCRIPT}
    ${UI_SCRIPT}
    ${API_SCRIPT}
    ${RENDER_SCRIPT}
    ${GRAPH_SCRIPT}
    ${TIMELINE_SCRIPT}
    ${INIT_SCRIPT}
  `;
}
