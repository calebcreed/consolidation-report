/**
 * Git Commit Clustering - Analyze git history to find related files
 *
 * Files that are committed together are likely related.
 * This is often a better signal than dependency analysis.
 */

import { execSync } from 'child_process';
import * as path from 'path';

export interface CommitInfo {
  hash: string;
  message: string;
  files: string[];
}

export interface FileCooccurrence {
  file1: string;
  file2: string;
  count: number;  // How many commits they appeared together in
}

export interface GitCluster {
  id: number;
  name: string;
  files: string[];
  commits: string[];  // Commit hashes that touched these files
  commitMessages: string[];  // For context
}

export interface GitClusteringResult {
  branch: string;
  totalCommits: number;
  totalFiles: number;
  clusters: GitCluster[];
  conflicts: string[];  // Files that appear in both branches
}

/**
 * Get commits from a branch that touch a specific path
 */
export function getCommitsForBranch(
  repoPath: string,
  branch: string,
  filterPath: string,
  limit: number = 500
): CommitInfo[] {
  const cmd = `git log ${branch} -${limit} --name-only --pretty=format:"COMMIT:%H|%s" -- "${filterPath}"`;

  let output: string;
  try {
    output = execSync(cmd, { cwd: repoPath, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  } catch (e: any) {
    console.error(`Git command failed: ${e.message}`);
    return [];
  }

  return parseGitLogOutput(output);
}

/**
 * Parse git log --name-only output into structured commits
 */
function parseGitLogOutput(output: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  const lines = output.split('\n');

  let currentCommit: CommitInfo | null = null;

  for (const line of lines) {
    if (line.startsWith('COMMIT:')) {
      // Save previous commit
      if (currentCommit && currentCommit.files.length > 0) {
        commits.push(currentCommit);
      }

      // Parse new commit
      const [hashPart, ...messageParts] = line.slice(7).split('|');
      currentCommit = {
        hash: hashPart,
        message: messageParts.join('|'),
        files: [],
      };
    } else if (line.trim() && currentCommit) {
      // It's a file path
      currentCommit.files.push(line.trim());
    }
  }

  // Don't forget the last commit
  if (currentCommit && currentCommit.files.length > 0) {
    commits.push(currentCommit);
  }

  return commits;
}

/**
 * Build co-occurrence matrix from commits
 */
export function buildCooccurrenceMatrix(commits: CommitInfo[]): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();

  for (const commit of commits) {
    const files = commit.files;

    // For each pair of files in this commit, increment their co-occurrence
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const file1 = files[i];
        const file2 = files[j];

        // Ensure consistent ordering
        const [a, b] = file1 < file2 ? [file1, file2] : [file2, file1];

        if (!matrix.has(a)) {
          matrix.set(a, new Map());
        }
        const row = matrix.get(a)!;
        row.set(b, (row.get(b) || 0) + 1);
      }
    }
  }

  return matrix;
}

/**
 * Cluster files based on co-occurrence using simple greedy algorithm
 */
export function clusterByCooccurrence(
  commits: CommitInfo[],
  minCooccurrence: number = 2,
  maxClusterSize: number = 20
): GitCluster[] {
  const matrix = buildCooccurrenceMatrix(commits);
  const allFiles = new Set<string>();

  for (const commit of commits) {
    commit.files.forEach(f => allFiles.add(f));
  }

  const clusters: GitCluster[] = [];
  const assigned = new Set<string>();
  let clusterId = 0;

  // Build adjacency list with strong connections
  const adjacency = new Map<string, Set<string>>();
  for (const [file1, row] of matrix) {
    for (const [file2, count] of row) {
      if (count >= minCooccurrence) {
        if (!adjacency.has(file1)) adjacency.set(file1, new Set());
        if (!adjacency.has(file2)) adjacency.set(file2, new Set());
        adjacency.get(file1)!.add(file2);
        adjacency.get(file2)!.add(file1);
      }
    }
  }

  // Greedy clustering: start with highest-degree nodes
  const filesByDegree = Array.from(allFiles).sort((a, b) => {
    const degA = adjacency.get(a)?.size || 0;
    const degB = adjacency.get(b)?.size || 0;
    return degB - degA;
  });

  for (const seedFile of filesByDegree) {
    if (assigned.has(seedFile)) continue;

    // Start new cluster with this file
    const clusterFiles = new Set<string>([seedFile]);
    assigned.add(seedFile);

    // Add connected files
    const queue = [seedFile];
    while (queue.length > 0 && clusterFiles.size < maxClusterSize) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current) || new Set();

      for (const neighbor of neighbors) {
        if (!assigned.has(neighbor) && clusterFiles.size < maxClusterSize) {
          clusterFiles.add(neighbor);
          assigned.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (clusterFiles.size > 0) {
      // Find commits that touched these files
      const clusterCommits = commits.filter(c =>
        c.files.some(f => clusterFiles.has(f))
      );

      clusters.push({
        id: clusterId++,
        name: generateClusterName(Array.from(clusterFiles)),
        files: Array.from(clusterFiles),
        commits: clusterCommits.slice(0, 10).map(c => c.hash),
        commitMessages: clusterCommits.slice(0, 5).map(c => c.message),
      });
    }
  }

  // Add remaining unconnected files as single-file clusters or one "misc" cluster
  const unassigned = Array.from(allFiles).filter(f => !assigned.has(f));
  if (unassigned.length > 0) {
    // Group by directory
    const byDir = new Map<string, string[]>();
    for (const file of unassigned) {
      const dir = path.dirname(file);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(file);
    }

    for (const [dir, files] of byDir) {
      if (files.length > 0) {
        clusters.push({
          id: clusterId++,
          name: `${path.basename(dir)}-misc`,
          files,
          commits: [],
          commitMessages: [],
        });
      }
    }
  }

  return clusters;
}

/**
 * Generate a name for a cluster based on common path patterns
 */
function generateClusterName(files: string[]): string {
  if (files.length === 0) return 'empty';
  if (files.length === 1) return path.basename(files[0], '.ts');

  // Find common directory
  const dirs = files.map(f => path.dirname(f));
  const commonDir = findCommonPrefix(dirs);

  // Find common patterns in filenames
  const basenames = files.map(f => path.basename(f, '.ts'));
  const patterns = ['component', 'service', 'module', 'guard', 'state', 'api', 'model'];

  for (const pattern of patterns) {
    if (basenames.some(b => b.includes(pattern))) {
      const dirName = path.basename(commonDir) || 'root';
      return `${dirName}-${pattern}s`;
    }
  }

  return path.basename(commonDir) || 'cluster';
}

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];

  const parts = strings.map(s => s.split('/'));
  const minLen = Math.min(...parts.map(p => p.length));

  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const segment = parts[0][i];
    if (parts.every(p => p[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  return common.join('/');
}

/**
 * Find files that appear in both branches (conflict candidates)
 */
export function findConflictFiles(
  commitsA: CommitInfo[],
  commitsB: CommitInfo[]
): string[] {
  const filesA = new Set<string>();
  const filesB = new Set<string>();

  commitsA.forEach(c => c.files.forEach(f => filesA.add(f)));
  commitsB.forEach(c => c.files.forEach(f => filesB.add(f)));

  return Array.from(filesA).filter(f => filesB.has(f));
}

/**
 * Main analysis function - analyze both branches and produce report
 */
export function analyzeGitHistory(
  repoPath: string,
  branchA: string,
  branchB: string,
  filterPath: string,
  commitLimit: number = 500
): {
  branchA: GitClusteringResult;
  branchB: GitClusteringResult;
  conflicts: string[];
} {
  console.log(`Analyzing ${branchA}...`);
  const commitsA = getCommitsForBranch(repoPath, branchA, filterPath, commitLimit);
  const clustersA = clusterByCooccurrence(commitsA);

  console.log(`Analyzing ${branchB}...`);
  const commitsB = getCommitsForBranch(repoPath, branchB, filterPath, commitLimit);
  const clustersB = clusterByCooccurrence(commitsB);

  const conflicts = findConflictFiles(commitsA, commitsB);

  const allFilesA = new Set<string>();
  commitsA.forEach(c => c.files.forEach(f => allFilesA.add(f)));

  const allFilesB = new Set<string>();
  commitsB.forEach(c => c.files.forEach(f => allFilesB.add(f)));

  return {
    branchA: {
      branch: branchA,
      totalCommits: commitsA.length,
      totalFiles: allFilesA.size,
      clusters: clustersA,
      conflicts,
    },
    branchB: {
      branch: branchB,
      totalCommits: commitsB.length,
      totalFiles: allFilesB.size,
      clusters: clustersB,
      conflicts,
    },
    conflicts,
  };
}
