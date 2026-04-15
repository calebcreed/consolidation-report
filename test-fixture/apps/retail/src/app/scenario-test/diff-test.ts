// Retail version - DIFFERENT COMMENT
import { bar } from './bar';
import { foo } from './foo';

export function testFunc(): string {
    return foo() + bar();
}
