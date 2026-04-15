// SCENARIO 2: Godzilla (depends on Tokyo - migrates second)
// Step 1: Tokyo migrates, this file gets import updated to point to merged
// Step 2: This file becomes migratable, import gets re-relativized
import { TOKYO_DATA, tokyoInfo } from '../../../../merged/src/app/scenario-test/tokyo';

export function godzillaAttack(): string {
  return `Godzilla attacks ${tokyoInfo()}! ${TOKYO_DATA}`;
}
