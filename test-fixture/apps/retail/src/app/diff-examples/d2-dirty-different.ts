// D2: This file has DIFFERENT content in restaurant vs retail
// It should be detected as DIRTY and NOT safe to migrate

export const BRANCH_NAME = 'retail';  // Different in restaurant!

export function getBranchConfig() {
  return {
    name: 'Retail Branch',
    features: ['pos', 'inventory', 'scanning']  // Different features
  };
}
