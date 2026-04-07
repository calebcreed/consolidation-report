import * as fs from 'fs';
import * as path from 'path';
import { FileNode, DependencyEdge } from '../config';

export interface MigrationFile {
  nodeId: string;
  sourcePath: string;        // Current absolute path (retail or restaurant)
  targetPath: string;        // New path in shared folder
  sourceRelative: string;    // Relative from source root
  targetRelative: string;    // Relative from shared root
  associatedFiles?: string[]; // Related files (template, styles)
}

export interface ImportUpdate {
  filePath: string;          // File to update
  oldImport: string;         // Old import path
  newImport: string;         // New import path
  line: number;              // Line number (approximate)
}

export interface BarrelUpdate {
  barrelPath: string;        // index.ts path
  exportToAdd: string;       // New export statement
  exportToRemove: string;    // Old export to remove (if any)
}

export interface PathAlias {
  alias: string;             // e.g., "@app/*"
  paths: string[];           // e.g., ["src/app/*"]
}

export interface MigrationPlan {
  files: MigrationFile[];
  importUpdates: ImportUpdate[];
  barrelUpdates: BarrelUpdate[];
  filesToDelete: string[];   // Original files to delete after migration
  warnings: string[];
  stats: {
    filesToMove: number;
    filesToUpdate: number;
    importsToRewrite: number;
    barrelUpdates: number;
    filesToDelete: number;
  };
}

export class Migrator {
  private retailPath: string;
  private restaurantPath: string;
  private sharedPath: string;
  private nodes: Map<string, FileNode>;
  private edges: DependencyEdge[];
  private pathAliases: PathAlias[] = [];
  private tsconfigBaseDir: string = '';

  constructor(
    retailPath: string,
    restaurantPath: string,
    sharedPath: string,
    nodes: Map<string, FileNode>,
    edges: DependencyEdge[],
    tsconfigPath?: string
  ) {
    this.retailPath = retailPath;
    this.restaurantPath = restaurantPath;
    this.sharedPath = sharedPath;
    this.nodes = nodes;
    this.edges = edges;

    if (tsconfigPath) {
      this.loadTsConfig(tsconfigPath);
    }
  }

  /**
   * Load and parse tsconfig.json to extract path aliases
   */
  private loadTsConfig(tsconfigPath: string): void {
    try {
      const absolutePath = path.resolve(tsconfigPath);
      this.tsconfigBaseDir = path.dirname(absolutePath);

      const content = fs.readFileSync(absolutePath, 'utf-8');
      // Remove comments (simple approach - doesn't handle all edge cases)
      const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const tsconfig = JSON.parse(jsonContent);

      const paths = tsconfig.compilerOptions?.paths || {};
      const baseUrl = tsconfig.compilerOptions?.baseUrl || '.';
      const baseUrlAbsolute = path.resolve(this.tsconfigBaseDir, baseUrl);

      for (const [alias, aliasPaths] of Object.entries(paths)) {
        this.pathAliases.push({
          alias,
          paths: (aliasPaths as string[]).map(p => path.resolve(baseUrlAbsolute, p)),
        });
      }

      console.log(`  Loaded ${this.pathAliases.length} path aliases from tsconfig`);
      for (const pa of this.pathAliases.slice(0, 5)) {
        console.log(`    ${pa.alias} -> ${pa.paths[0]}`);
      }
      if (this.pathAliases.length > 5) {
        console.log(`    ... and ${this.pathAliases.length - 5} more`);
      }
    } catch (err) {
      console.warn(`  Warning: Could not load tsconfig: ${err}`);
    }
  }

  /**
   * Resolve a path alias import to an absolute file path
   */
  private resolveAliasedImport(importPath: string): string | null {
    for (const { alias, paths } of this.pathAliases) {
      // Handle wildcard aliases like "@app/*"
      if (alias.endsWith('/*')) {
        const aliasPrefix = alias.slice(0, -2); // "@app"
        if (importPath.startsWith(aliasPrefix + '/')) {
          const remainder = importPath.slice(aliasPrefix.length + 1); // "modules/foo"
          for (const aliasPath of paths) {
            const basePath = aliasPath.slice(0, -2); // Remove "/*"
            const resolved = path.join(basePath, remainder);

            // Try with various extensions
            if (fs.existsSync(resolved + '.ts')) return resolved + '.ts';
            if (fs.existsSync(resolved + '.tsx')) return resolved + '.tsx';
            if (fs.existsSync(resolved + '/index.ts')) return resolved + '/index.ts';
            if (fs.existsSync(resolved)) return resolved;
          }
        }
      } else if (alias === importPath) {
        // Exact match alias
        for (const aliasPath of paths) {
          if (fs.existsSync(aliasPath + '.ts')) return aliasPath + '.ts';
          if (fs.existsSync(aliasPath + '/index.ts')) return aliasPath + '/index.ts';
          if (fs.existsSync(aliasPath)) return aliasPath;
        }
      }
    }
    return null;
  }

  /**
   * Check if an import path uses a path alias
   */
  private isAliasedImport(importPath: string): boolean {
    // Relative imports are not aliased
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return false;
    }
    // Check if it matches any alias
    for (const { alias } of this.pathAliases) {
      const aliasPrefix = alias.endsWith('/*') ? alias.slice(0, -2) : alias;
      if (importPath === aliasPrefix || importPath.startsWith(aliasPrefix + '/')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Plan migration for a set of node IDs
   */
  planMigration(nodeIds: string[]): MigrationPlan {
    const warnings: string[] = [];
    const filesToMove: MigrationFile[] = [];
    const importUpdates: ImportUpdate[] = [];
    const barrelUpdates: BarrelUpdate[] = [];
    const filesToDelete: string[] = [];

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

      // Find associated files (template, styles, spec)
      const associatedFiles = this.findAssociatedFiles(sourcePath);

      filesToMove.push({
        nodeId,
        sourcePath,
        targetPath,
        sourceRelative,
        targetRelative,
        associatedFiles,
      });

      // Track files to delete (source files in both branches)
      filesToDelete.push(sourcePath);
      if (node.retailPath && node.retailPath !== sourcePath) {
        filesToDelete.push(node.retailPath);
      }
      if (node.restaurantPath && node.restaurantPath !== sourcePath) {
        filesToDelete.push(node.restaurantPath);
      }
      // Also delete associated files from both branches
      for (const assoc of associatedFiles) {
        filesToDelete.push(assoc);
        // Find corresponding file in other branch
        const otherBranch = sourceBase === this.retailPath ? this.restaurantPath : this.retailPath;
        const otherPath = path.join(otherBranch, path.relative(sourceBase, assoc));
        if (fs.existsSync(otherPath)) {
          filesToDelete.push(otherPath);
        }
      }
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

    // Find barrel files (index.ts) that export moved files
    const barrelFiles = this.findAffectedBarrelFiles(filesToMove, pathMapping);
    barrelUpdates.push(...barrelFiles);

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

    // Count total files including associated
    let totalFilesToMove = filesToMove.length;
    for (const f of filesToMove) {
      totalFilesToMove += (f.associatedFiles?.length || 0);
    }

    return {
      files: filesToMove,
      importUpdates,
      barrelUpdates,
      filesToDelete: [...new Set(filesToDelete)], // Dedupe
      warnings,
      stats: {
        filesToMove: totalFilesToMove,
        filesToUpdate: filesToUpdate.size,
        importsToRewrite: importUpdates.length,
        barrelUpdates: barrelUpdates.length,
        filesToDelete: filesToDelete.length,
      },
    };
  }

  /**
   * Find associated files for a TypeScript file (template, styles, spec)
   */
  private findAssociatedFiles(tsFilePath: string): string[] {
    const associated: string[] = [];
    const dir = path.dirname(tsFilePath);
    const baseName = path.basename(tsFilePath, path.extname(tsFilePath));

    // Common associated file patterns
    const patterns = [
      `${baseName}.html`,
      `${baseName}.scss`,
      `${baseName}.css`,
      `${baseName}.less`,
      `${baseName}.spec.ts`,
      `${baseName}.test.ts`,
    ];

    for (const pattern of patterns) {
      const filePath = path.join(dir, pattern);
      if (fs.existsSync(filePath)) {
        associated.push(filePath);
      }
    }

    return associated;
  }

  /**
   * Find barrel files (index.ts) that re-export moved files
   */
  private findAffectedBarrelFiles(
    filesToMove: MigrationFile[],
    pathMapping: Map<string, string>
  ): BarrelUpdate[] {
    const updates: BarrelUpdate[] = [];
    const processedBarrels = new Set<string>();

    for (const file of filesToMove) {
      // Check for index.ts in the same directory and parent directories
      let dir = path.dirname(file.sourcePath);
      const sourceBase = file.sourcePath.startsWith(this.retailPath) ? this.retailPath : this.restaurantPath;

      while (dir.startsWith(sourceBase) && dir !== sourceBase) {
        const barrelPath = path.join(dir, 'index.ts');

        if (fs.existsSync(barrelPath) && !processedBarrels.has(barrelPath)) {
          processedBarrels.add(barrelPath);

          const content = fs.readFileSync(barrelPath, 'utf-8');

          // Check if this barrel exports the moved file
          const relativePath = './' + path.relative(dir, file.sourcePath).replace(/\\/g, '/').replace(/\.ts$/, '');

          if (content.includes(relativePath)) {
            // Calculate new export path from shared barrel location
            const barrelRelative = path.relative(sourceBase, barrelPath);
            const newBarrelPath = path.join(this.sharedPath, barrelRelative);
            const newRelativePath = './' + path.relative(path.dirname(newBarrelPath), file.targetPath).replace(/\\/g, '/').replace(/\.ts$/, '');

            updates.push({
              barrelPath,
              exportToRemove: relativePath,
              exportToAdd: newRelativePath,
            });
          }
        }

        dir = path.dirname(dir);
      }
    }

    return updates;
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

    // Determine where this file will be after migration
    const movedFile = filesToMove.find(f => f.sourcePath === filePath);
    const effectiveFilePath = movedFile ? movedFile.targetPath : filePath;

    // Find import statements
    const importRegex = /^(import\s+.*?from\s+['"])([^'"]+)(['"])/gm;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[2];
      let resolvedImport: string | null = null;

      // Check if this is an aliased import (e.g., @app/modules/...)
      if (this.isAliasedImport(importPath)) {
        resolvedImport = this.resolveAliasedImport(importPath);
      } else if (importPath.startsWith('.') || importPath.startsWith('/')) {
        // Relative or absolute import
        const currentDir = path.dirname(filePath);
        resolvedImport = path.resolve(currentDir, importPath);

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
      } else {
        // External package - skip
        continue;
      }

      if (!resolvedImport) continue;

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
  executeMigration(
    plan: MigrationPlan,
    dryRun: boolean = false,
    deleteOriginals: boolean = true
  ): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    if (dryRun) {
      console.log('\n=== DRY RUN - No changes will be made ===\n');
    }

    // Step 1: Create directories and copy files (including associated files)
    console.log(`\nStep 1: Copying ${plan.stats.filesToMove} files to shared...`);
    for (const file of plan.files) {
      const targetDir = path.dirname(file.targetPath);
      const sourceBase = file.sourcePath.startsWith(this.retailPath) ? this.retailPath : this.restaurantPath;

      if (!dryRun) {
        // Create target directory
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Copy main file
        try {
          fs.copyFileSync(file.sourcePath, file.targetPath);
          console.log(`  ✓ ${file.sourceRelative}`);
        } catch (err) {
          errors.push(`Failed to copy ${file.sourcePath}: ${err}`);
          console.log(`  ✗ ${file.sourceRelative}: ${err}`);
        }

        // Copy associated files (template, styles, spec)
        for (const assocPath of file.associatedFiles || []) {
          const assocRelative = path.relative(sourceBase, assocPath);
          const assocTarget = path.join(this.sharedPath, assocRelative);
          const assocTargetDir = path.dirname(assocTarget);

          if (!fs.existsSync(assocTargetDir)) {
            fs.mkdirSync(assocTargetDir, { recursive: true });
          }

          try {
            fs.copyFileSync(assocPath, assocTarget);
            console.log(`  ✓ ${assocRelative} (associated)`);
          } catch (err) {
            errors.push(`Failed to copy ${assocPath}: ${err}`);
            console.log(`  ✗ ${assocRelative}: ${err}`);
          }
        }
      } else {
        console.log(`  [would copy] ${file.sourceRelative} -> shared/${file.targetRelative}`);
        for (const assocPath of file.associatedFiles || []) {
          const assocRelative = path.relative(sourceBase, assocPath);
          console.log(`  [would copy] ${assocRelative} (associated)`);
        }
      }
    }

    // Step 2: Update imports in all affected files
    console.log(`\nStep 2: Updating imports in ${plan.stats.filesToUpdate} files...`);

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
          console.log(`  ✓ ${path.relative(this.sharedPath, effectivePath) || path.relative(this.retailPath, effectivePath) || path.basename(effectivePath)} (${updates.length} imports)`);
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

    // Step 3: Update barrel files (index.ts re-exports)
    if (plan.barrelUpdates.length > 0) {
      console.log(`\nStep 3: Updating ${plan.barrelUpdates.length} barrel files...`);
      for (const barrel of plan.barrelUpdates) {
        if (!dryRun) {
          try {
            let content = fs.readFileSync(barrel.barrelPath, 'utf-8');

            // Replace old export with new
            const oldExportPattern = new RegExp(
              `(export\\s+.*?from\\s+['"])${this.escapeRegex(barrel.exportToRemove)}(['"])`,
              'g'
            );
            content = content.replace(oldExportPattern, `$1${barrel.exportToAdd}$2`);

            fs.writeFileSync(barrel.barrelPath, content);
            console.log(`  ✓ ${path.basename(barrel.barrelPath)}`);
          } catch (err) {
            errors.push(`Failed to update barrel ${barrel.barrelPath}: ${err}`);
            console.log(`  ✗ ${barrel.barrelPath}: ${err}`);
          }
        } else {
          console.log(`  [would update] ${path.basename(barrel.barrelPath)}`);
          console.log(`    ${barrel.exportToRemove} -> ${barrel.exportToAdd}`);
        }
      }
    }

    // Step 4: Delete original files
    if (deleteOriginals && plan.filesToDelete.length > 0) {
      console.log(`\nStep 4: Deleting ${plan.filesToDelete.length} original files...`);
      for (const filePath of plan.filesToDelete) {
        if (!fs.existsSync(filePath)) continue;

        if (!dryRun) {
          try {
            fs.unlinkSync(filePath);
            const rel = filePath.startsWith(this.retailPath)
              ? path.relative(this.retailPath, filePath)
              : path.relative(this.restaurantPath, filePath);
            console.log(`  ✓ deleted ${rel}`);
          } catch (err) {
            errors.push(`Failed to delete ${filePath}: ${err}`);
            console.log(`  ✗ ${filePath}: ${err}`);
          }
        } else {
          const rel = filePath.startsWith(this.retailPath)
            ? `retail/${path.relative(this.retailPath, filePath)}`
            : `restaurant/${path.relative(this.restaurantPath, filePath)}`;
          console.log(`  [would delete] ${rel}`);
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
