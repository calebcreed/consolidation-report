// Uses named imports from target-named
import { NAMED_CONST, namedHelper, NamedClass } from './target-named';

export function useNamed(): string {
  const instance = new NamedClass();
  return instance.value + namedHelper(5) + NAMED_CONST;
}
