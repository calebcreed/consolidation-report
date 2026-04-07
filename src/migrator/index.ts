import * as fs from 'fs';
import * as path from 'path';
import { FileNode, DependencyEdge } from '../config';

export interface MigrationFile {
  nodeId: string;
  sourcePath: string;        // Current absolute path (retail or restaurant)
  targetPath: string;        // New path in shared folder
  sourceRelative: string;    // Relative from source root
  targetRelative: string;    // Relative from shared root
}

export interface ImportUpdate {
  filePath: string;          // File to update
  oldImport: string;         // Old import path
  newImport: string;         // New import path
  line: number;              // Line number (approximate)
}

export interface MigrationPlan {
  files: MigrationFile[];
  importUpdates: ImportUpdate[];
  warnings: string[];
  stats: {
    filesToMove: number;
    filesToUpdate: number;
    importsToRewrite: number;
  };
}

export class Migrator {
  private retailPath: string;
  private restaurantPath: string;
  private sharedPath: string;
  private nodes: Map<string, FileNode>;
  private edges: DependencyEdge[];

  constructor(
    retailPath: string,
    restaurantPath: string,
    sharedPath: string,
    nodes: Map<string, FileNode>,
    edges: DependencyEdge[]
  ) {
    this.retailPath = retailPath;
    this.restaurantPath = restaurantPath;
    this.sharedPath = sharedPath;
    this.nodes = nodes;
    this.edges = edges;
  }

  /**
   * Plan migration for a set of node IDs
   */
  planMigration(nodeIds: string[]): MigrationPlan {
    const warnings: string[] = [];
    const filesToMove: MigrationFile[] = [];
    const importUpdates: ImportUpdate[] = [];

    // Expand to include all dependencies (topological order)
    const allNodeIds = this.expandWithDependencies(nodeIds);

    // Topologically sort - dependencies first
    const sorted = this.topologicalSort(allNodeIds);

    // Plan file moves
    for (const nodeId of sorted) {
      const node = this.nodes.get(nodeId);
      if (!node) {
        warnings.push(`Node not found: ${nodeId}`);
        continue;
      }

      // Use retail path as source, fall back to restaurant
      const sourcePath = node.retailPath || node.restaurantPath;
      if (!sourcePath) {
        warnings.push(`No source path for node: ${nodeId}`);
        continue;
      }

      // Determine source base path
      const sourceBase = node.retailPath ? this.retailPath : this.restaurantPath;
      const sourceRelative = path.relative(sourceBase, sourcePath);

      // Target path in shared folder (maintain directory structure)
      const targetRelative = sourceRelative;
      const targetPath = path.join(this.sharedPath, targetRelative);

      filesToMove.push({
        nodeId,
        sourcePath,
        targetPath,
        sourceRelative,
        targetRelative,
      });
    }

    // Build a map of old path -> new path for import rewriting
    const pathMapping = new Map<string, string>();
    for (const file of filesToMove) {
      pathMapping.set(file.sourcePath, file.targetPath);
      // Also map the other branch's path if it exists
      const node = this.nodes.get(file.nodeId);
      if (node?.retailPath && node.retailPath !== file.sourcePath) {
        pathMapping.set(node.retailPath, file.targetPath);
      }
      if (node?.restaurantPath && node.restaurantPath !== file.sourcePath) {
        pathMapping.set(node.restaurantPath, file.targetPath);
      }
    }

    // Find all files that need import updates
    const filesToUpdate = new Set<string>();

    // 1. Files being moved need their imports updated
    for (const file of filesToMove) {
      filesToUpdate.add(file.sourcePath);
    }

    // 2. Files that import moved files need updates
    for (const node of this.nodes.values()) {
      const nodePath = node.retailPath || node.restaurantPath;
      if (!nodePath) continue;

      // Check if this node imports any of the moved files
      for (const depId of node.dependencies) {
        const depNode = this.nodes.get(depId);
        if (!depNode) continue;

        const depPath = depNode.retailPath || depNode.restaurantPath;
        if (depPath && pathMapping.has(depPath)) {
          filesToUpdate.add(nodePath);
          break;
        }
      }
    }

    // Calculate import updates for each file
    for (const filePath of filesToUpdate) {
      const updates = this.calculateImportUpdates(filePath, pathMapping, filesToMove);
      importUpdates.push(...updates);
    }

    return {
      files: filesToMove,
      importUpdates,
      warnings,
      stats: {
        filesToMove: filesToMove.length,
        filesToUpdate: filesToUpdate.size,
        importsToRewrite: importUpdates.length,
      },
    };
  }

  /**
   * Expand node IDs to include all their dependencies
   */
  private expandWithDependencies(nodeIds: string[]): Set<string> {
    const result = new Set<string>();
    const queue = [...nodeIds];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (result.has(nodeId)) continue;

      const node = this.nodes.get(nodeId);
      if (!node) continue;

      result.add(nodeId);

      // Add dependencies to queue
      for (const depId of node.dependencies) {
        if (!result.has(depId)) {
          queue.push(depId);
        }
      }
    }

    return result;
  }

  /**
   * Topological sort - dependencies come before dependents
   */
  private topologicalSort(nodeIds: Set<string>): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) return; // Cycle - skip

      visiting.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (nodeIds.has(depId)) {
            visit(depId);
          }
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    for (const nodeId of nodeIds) {
      visit(nodeId);
    }

    return result;
  }

  /**
   * Calculate import updates needed for a file
   */
  private calculateImportUpdates(
    filePath: string,
    pathMapping: Map<string, string>,
    filesToMove: MigrationFile[]
  ): ImportUpdate[] {
    const updates: ImportUpdate[] = [];

    if (!fs.existsSync(filePath)) return updates;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Determine where this file will be after migration
    const movedFile = filesToMove.find(f => f.sourcePath === filePath);
    const effectiveFilePath = movedFile ? movedFile.targetPath : filePath;

    // Find import statements
    const importRegex = /^(import\s+.*?from\s+['"])([^'"]+)(['"])/gm;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[2];

      // Skip external packages
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        continue;
      }

      // Resolve the import to absolute path
      const currentDir = path.dirname(filePath);
      let resolvedImport = path.resolve(currentDir, importPath);

      // Handle missing extension
      if (!path.extname(resolvedImport)) {
        if (fs.existsSync(resolvedImport + '.ts')) {
          resolvedImport += '.ts';
        } else if (fs.existsSync(resolvedImport + '.tsx')) {
          resolvedImport += '.tsx';
        } else if (fs.existsSync(path.join(resolvedImport, 'index.ts'))) {
          resolvedImport = path.join(resolvedImport, 'index.ts');
        }
      }

      // Check if this import needs to be rewritten
      const newTargetPath = pathMapping.get(resolvedImport);
      if (newTargetPath) {
        // Calculate new relative import from effective file location
        const newDir = path.dirname(effectiveFilePath);
        let newImport = path.relative(newDir, newTargetPath);

        // Remove extension for cleaner imports
        newImport = newImport.replace(/\.(ts|tsx)$/, '');

        // Ensure it starts with ./ or ../
        if (!newImport.startsWith('.')) {
          newImport = './' + newImport;
        }

        // Normalize path separators
        newImport = newImport.replace(/\\/g, '/');

        if (newImport !== importPath) {
          // Find line number
          const lineIndex = content.substring(0, match.index).split('\n').length;

          updates.push({
            filePath,
            oldImport: importPath,
            newImport,
            line: lineIndex,
          });
        }
      }
    }

    return updates;
  }

  /**
   * Execute a migration plan
   */
  executeMigration(plan: MigrationPlan, dryRun: boolean = false): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    if (dryRun) {
      console.log('\n=== DRY RUN - No changes will be made ===\n');
    }

    // Step 1: Create directories and copy files
    console.log(`Moving ${plan.files.length} files to shared...`);
    for (const file of plan.files) {
      const targetDir = path.dirname(file.targetPath);

      if (!dryRun) {
        // Create target directory
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Copy file
        try {
          fs.copyFileSync(file.sourcePath, file.targetPath);
          console.log(`  ✓ ${file.sourceRelative}`);
        } catch (err) {
          errors.push(`Failed to copy ${file.sourcePath}: ${err}`);
          console.log(`  ✗ ${file.sourceRelative}: ${err}`);
        }
      } else {
        console.log(`  [would copy] ${file.sourceRelative} -> shared/${file.targetRelative}`);
      }
    }

    // Step 2: Update imports in all affected files
    console.log(`\nUpdating imports in ${plan.stats.filesToUpdate} files...`);

    // Group updates by file
    const updatesByFile = new Map<string, ImportUpdate[]>();
    for (const update of plan.importUpdates) {
      if (!updatesByFile.has(update.filePath)) {
        updatesByFile.set(update.filePath, []);
      }
      updatesByFile.get(update.filePath)!.push(update);
    }

    for (const [filePath, updates] of updatesByFile) {
      // Determine the effective path (might have been moved)
      const movedFile = plan.files.find(f => f.sourcePath === filePath);
      const effectivePath = movedFile ? movedFile.targetPath : filePath;

      if (!dryRun) {
        try {
          let content = fs.readFileSync(effectivePath, 'utf-8');

          for (const update of updates) {
            // Replace the import path
            const oldPattern = new RegExp(
              `(from\\s+['"])${this.escapeRegex(update.oldImport)}(['"])`,
              'g'
            );
            content = content.replace(oldPattern, `$1${update.newImport}$2`);
          }

          fs.writeFileSync(effectivePath, content);
          console.log(`  ✓ ${path.relative(this.sharedPath, effectivePath) || path.basename(effectivePath)} (${updates.length} imports)`);
        } catch (err) {
          errors.push(`Failed to update ${effectivePath}: ${err}`);
          console.log(`  ✗ ${effectivePath}: ${err}`);
        }
      } else {
        console.log(`  [would update] ${path.basename(filePath)} (${updates.length} imports)`);
        for (const update of updates.slice(0, 3)) {
          console.log(`    ${update.oldImport} -> ${update.newImport}`);
        }
        if (updates.length > 3) {
          console.log(`    ... and ${updates.length - 3} more`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get movable subtrees (clean subtrees that can be migrated)
   */
  getMovableSubtrees(): Array<{ rootId: string; nodeIds: string[]; totalFiles: number }> {
    const movable: Array<{ rootId: string; nodeIds: string[]; totalFiles: number }> = [];

    for (const node of this.nodes.values()) {
      if (!node.isCleanSubtree) continue;

      // Check if this is a root (no clean dependents, or is itself a top-level node)
      const isRoot = node.dependents.length === 0 ||
        node.dependents.every(depId => {
          const dep = this.nodes.get(depId);
          return !dep?.isCleanSubtree;
        });

      if (isRoot) {
        const nodeIds = this.collectCleanSubtree(node.id);
        movable.push({
          rootId: node.id,
          nodeIds: Array.from(nodeIds),
          totalFiles: nodeIds.size,
        });
      }
    }

    // Sort by size descending
    movable.sort((a, b) => b.totalFiles - a.totalFiles);

    return movable;
  }

  private collectCleanSubtree(rootId: string): Set<string> {
    const result = new Set<string>();
    const queue = [rootId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (result.has(nodeId)) continue;

      const node = this.nodes.get(nodeId);
      if (!node?.isCleanSubtree) continue;

      result.add(nodeId);

      for (const depId of node.dependencies) {
        if (!result.has(depId)) {
          queue.push(depId);
        }
      }
    }

    return result;
  }
}

export { Migrator as default };
