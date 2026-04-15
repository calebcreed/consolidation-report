// D2: This file has DIFFERENT content in restaurant vs retail
// It should be detected as DIRTY and NOT safe to migrate

export const BRANCH_NAME = 'restaurant';  // Different in retail!

export function getBranchConfig() {
  return {
    name: 'Restaurant Branch',
    features: ['dine-in', 'takeout', 'delivery']  // Different features
  };
}
